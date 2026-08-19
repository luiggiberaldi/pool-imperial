-- Pool Imperial — reconciliación segura de idempotency_key duplicadas
--
-- Ejecutar DESPUÉS de add_reports_integrity.sql y ANTES de
-- add_sales_sync_integrity.sql.
--
-- Este script:
--   1. bloquea brevemente las tablas financieras;
--   2. identifica duplicados por cuenta + idempotency_key;
--   3. conserva la venta confirmada/con documento durable con menor fecha;
--   4. elimina SOLO copias con la misma firma financiera e ítems;
--   5. aborta y hace rollback si hay cuentas desconocidas o firmas distintas.
--
-- No resuelve automáticamente ventas legítimas que hayan colisionado en la
-- misma clave. En ese caso el script falla sin modificar datos.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.sales IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.sale_items IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.sync_documents IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _sales_sync_candidates ON COMMIT DROP AS
WITH item_signatures AS (
    SELECT
        s.id,
        md5(COALESCE(
            string_agg(
                concat_ws(
                    '|',
                    COALESCE(si.product_id, ''),
                    COALESCE(si.name, ''),
                    COALESCE(si.qty::TEXT, ''),
                    COALESCE(si.price_usd::TEXT, ''),
                    COALESCE(si.cost_usd::TEXT, ''),
                    COALESCE(si.is_weight::TEXT, '')
                ),
                '||' ORDER BY
                    si.product_id,
                    si.name,
                    si.qty,
                    si.price_usd,
                    si.cost_usd,
                    si.is_weight
            ),
            ''
        )) AS item_signature
    FROM public.sales s
    LEFT JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.idempotency_key IS NOT NULL
    GROUP BY s.id
),
ranked AS (
    SELECT
        s.id,
        s.user_id,
        s.idempotency_key,
        s.sale_number,
        s.status,
        s.tipo,
        s.timestamp,
        md5((jsonb_build_array(
            s.tipo,
            s.cart_subtotal_usd,
            s.discount_type,
            s.discount_value,
            s.discount_amount_usd,
            s.total_usd,
            s.total_bs,
            s.total_cop,
            s.rate,
            s.rate_source,
            s.change_usd,
            s.change_bs,
            s.customer_id,
            s.customer_name,
            s.customer_document,
            s.customer_phone,
            s.fiado_usd,
            s.split_meta,
            s.vendedor_id,
            s.vendedor_nombre,
            s.vendedor_rol,
            s.mesero_id,
            s.mesero_nombre,
            s.table_name,
            -- cash_session_id es opcional en instalaciones antiguas; leerlo
            -- desde el registro evita abortar la reconciliación antes de la
            -- migración add_reports_integrity.sql.
            (to_jsonb(s)->'cash_session_id'),
            COALESCE(i.item_signature, md5(''))
        ))::TEXT) AS business_signature,
        CASE UPPER(COALESCE(s.status, ''))
            WHEN 'COMPLETADA' THEN 0
            WHEN 'CONFIRMADA' THEN 1
            WHEN 'SYNCED' THEN 2
            WHEN 'PENDIENTE_VERIFICACION' THEN 3
            WHEN 'PENDIENTE_SYNC' THEN 4
            ELSE 5
        END AS status_rank,
        CASE WHEN EXISTS (
            SELECT 1
            FROM public.sync_documents d
            WHERE d.collection = 'sale'
              AND d.doc_id = s.id::TEXT
              AND d.user_id IS NOT DISTINCT FROM s.user_id
        ) THEN 1 ELSE 0 END AS durable_rank
    FROM public.sales s
    LEFT JOIN item_signatures i ON i.id = s.id
    WHERE s.idempotency_key IS NOT NULL
)
SELECT
    r.*,
    first_value(r.id) OVER (
        PARTITION BY r.user_id, r.idempotency_key
        ORDER BY
            r.status_rank,
            r.durable_rank DESC,
            r.timestamp NULLS LAST,
            r.sale_number,
            r.id
    ) AS canonical_id
FROM ranked r;

DO $$
DECLARE
    v_unknown_owner_groups INTEGER;
    v_ambiguous_groups INTEGER;
BEGIN
    SELECT COUNT(*)
      INTO v_unknown_owner_groups
      FROM (
          SELECT user_id, idempotency_key
          FROM _sales_sync_candidates
          GROUP BY user_id, idempotency_key
          HAVING COUNT(*) > 1 AND user_id IS NULL
      ) q;

    IF v_unknown_owner_groups > 0 THEN
        RAISE EXCEPTION
            'SYNC_RECONCILIATION_REQUIRED: % grupos duplicados no tienen user_id; asignar cuenta manualmente antes de continuar',
            v_unknown_owner_groups;
    END IF;

    SELECT COUNT(*)
      INTO v_ambiguous_groups
      FROM (
          SELECT user_id, idempotency_key
          FROM _sales_sync_candidates
          GROUP BY user_id, idempotency_key
          HAVING COUNT(*) > 1
             AND (
                 COUNT(DISTINCT business_signature) > 1
                 OR BOOL_OR(UPPER(COALESCE(status, '')) IN ('ANULADA', 'SYNC_ERROR', 'SYNC_CONFLICT'))
             )
      ) q;

    IF v_ambiguous_groups > 0 THEN
        RAISE EXCEPTION
            'SYNC_RECONCILIATION_REQUIRED: % grupos contienen ventas distintas con la misma idempotency_key; revisar manualmente',
            v_ambiguous_groups;
    END IF;
END $$;

CREATE TEMP TABLE _sales_sync_to_delete ON COMMIT DROP AS
SELECT DISTINCT
    id AS duplicate_id,
    user_id,
    idempotency_key,
    canonical_id
FROM _sales_sync_candidates
WHERE id <> canonical_id;

-- Auditoría de las filas que serán eliminadas. El script continúa únicamente
-- porque los guardrails anteriores confirmaron que son copias exactas.
SELECT
    duplicate_id,
    canonical_id,
    user_id,
    idempotency_key
FROM _sales_sync_to_delete
ORDER BY user_id, idempotency_key, duplicate_id;

-- Primero eliminar documentos y líneas dependientes para soportar instalaciones
-- antiguas que no tengan ON DELETE CASCADE configurado.
DELETE FROM public.sync_documents d
USING _sales_sync_to_delete x
WHERE d.collection = 'sale'
  AND d.doc_id = x.duplicate_id::TEXT
  AND d.user_id IS NOT DISTINCT FROM x.user_id;

DELETE FROM public.sale_items si
USING _sales_sync_to_delete x
WHERE si.sale_id = x.duplicate_id;

DELETE FROM public.sales s
USING _sales_sync_to_delete x
WHERE s.id = x.duplicate_id;

SELECT
    (SELECT COUNT(*) FROM _sales_sync_to_delete) AS duplicate_sales_removed,
    (SELECT COUNT(*)
     FROM (
         SELECT s.user_id, s.idempotency_key
         FROM public.sales s
         WHERE s.idempotency_key IS NOT NULL
         GROUP BY s.user_id, s.idempotency_key
         HAVING COUNT(*) > 1
     ) remaining_groups) AS duplicate_groups_remaining;

COMMIT;
