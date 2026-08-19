-- Pool Imperial — integridad transaccional de ventas offline/online
-- Ejecutar después de pool_imperial_full_schema.sql, add_reports_integrity.sql
-- y antes de activar el nuevo cliente.

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- No crear índices únicos a ciegas: si hay duplicados históricos, detener la
-- migración para reconciliarlos antes de bloquear el futuro.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.sales
        WHERE idempotency_key IS NOT NULL
        GROUP BY user_id, idempotency_key
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'SYNC_MIGRATION_BLOCKED: existen idempotency_key duplicadas; reconciliar antes de crear el índice único';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sales
        WHERE user_id IS NOT NULL
        GROUP BY user_id, sale_number
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'SYNC_MIGRATION_BLOCKED: existen sale_number duplicados por cuenta; reconciliar antes de crear el índice único';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_owner_idempotency
    ON public.sales(user_id, idempotency_key)
    WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_owner_sale_number
    ON public.sales(user_id, sale_number)
    WHERE user_id IS NOT NULL AND sale_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_owner_updated_cursor
    ON public.sales(user_id, updated_at, id);

COMMENT ON COLUMN public.sales.idempotency_key IS
    'Identidad de negocio estable: un reintento con la misma cuenta y clave no crea otra venta.';

-- ── RPC transaccional e idempotente ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_checkout(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale_id UUID;
    v_sale_number INTEGER;
    v_existing_status TEXT;
    v_user_id UUID;
    v_customer_id UUID;
    v_vendedor_id UUID;
    v_mesero_id UUID;
    v_cash_session_id UUID;
    v_idempotency_key UUID;
    v_fiado_amount NUMERIC;
    v_total NUMERIC;
    v_item JSONB;
    v_payment RECORD;
    v_sale_type TEXT;
    v_sync_payload JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.'
            USING ERRCODE = '42501';
    END IF;

    IF COALESCE(payload->>'idempotency_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'idempotency_key inválida o ausente'
            USING ERRCODE = '22023';
    END IF;
    v_idempotency_key := (payload->>'idempotency_key')::UUID;

    -- Serializa únicamente los correlativos de esta cuenta. La clave de
    -- idempotencia se revisa antes de cualquier efecto financiero.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

    SELECT id, sale_number, status
      INTO v_sale_id, v_sale_number, v_existing_status
      FROM public.sales
     WHERE user_id = v_user_id
       AND idempotency_key = v_idempotency_key
     FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_processed', true,
            'sale_id', v_sale_id,
            'sale_number', v_sale_number,
            'status', v_existing_status,
            'idempotency_key', v_idempotency_key
        );
    END IF;

    IF payload->>'customerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_customer_id := (payload->>'customerId')::UUID;
    END IF;
    IF payload->>'vendedorId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_vendedor_id := (payload->>'vendedorId')::UUID;
    END IF;
    IF payload->>'meseroId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_mesero_id := (payload->>'meseroId')::UUID;
    END IF;
    IF payload->>'cashSessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_cash_session_id := (payload->>'cashSessionId')::UUID;
    END IF;

    v_total := COALESCE(NULLIF(payload->>'total', '')::NUMERIC, 0);
    v_fiado_amount := COALESCE(NULLIF(payload->>'fiadoUsd', '')::NUMERIC, 0);
    IF v_total <= 0 THEN
        RAISE EXCEPTION 'El total de la venta debe ser mayor que cero'
            USING ERRCODE = '22023';
    END IF;

    v_sale_type := CASE WHEN v_fiado_amount > 0 THEN 'VENTA_FIADA' ELSE 'VENTA' END;
    SELECT COALESCE(MAX(sale_number), 0) + 1
      INTO v_sale_number
      FROM public.sales
     WHERE user_id = v_user_id;

    INSERT INTO public.sales (
        sale_number, tipo, status, cart_subtotal_usd,
        discount_type, discount_value, discount_amount_usd,
        total_usd, total_bs, total_cop, rate, rate_source,
        change_usd, change_bs, customer_id, customer_name,
        customer_document, customer_phone, fiado_usd, split_meta,
        idempotency_key, user_id, vendedor_id, vendedor_nombre,
        vendedor_rol, mesero_id, mesero_nombre, table_name,
        cash_session_id, updated_at
    ) VALUES (
        v_sale_number, v_sale_type, 'COMPLETADA',
        COALESCE(NULLIF(payload->>'cartSubtotalUsd', '')::NUMERIC, v_total),
        payload->>'discountType',
        COALESCE(NULLIF(payload->>'discountValue', '')::NUMERIC, 0),
        COALESCE(NULLIF(payload->>'discountAmountUsd', '')::NUMERIC, 0),
        v_total, 0, v_total, 1, 'COP',
        COALESCE(NULLIF(payload->>'changeUsdGiven', '')::NUMERIC, 0),
        0, v_customer_id, payload->>'customerName',
        payload->>'customerDocument', payload->>'customerPhone',
        v_fiado_amount, payload->'splitMeta', v_idempotency_key,
        v_user_id, v_vendedor_id, payload->>'vendedorNombre',
        payload->>'vendedorRol', v_mesero_id, payload->>'meseroNombre',
        payload->>'tableName', v_cash_session_id, NOW()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN
        SELECT value FROM jsonb_array_elements(COALESCE(payload->'cart', '[]'::JSONB))
    LOOP
        INSERT INTO public.sale_items (
            sale_id, product_id, name, qty, price_usd, cost_usd, is_weight
        ) VALUES (
            v_sale_id,
            COALESCE(v_item->>'id', v_item->>'productId', 'historical-product'),
            COALESCE(v_item->>'name', 'Producto'),
            COALESCE(NULLIF(v_item->>'qty', '')::NUMERIC, 0),
            COALESCE(
                NULLIF(v_item->>'price_usd', '')::NUMERIC,
                NULLIF(v_item->>'priceUsd', '')::NUMERIC,
                0
            ),
            COALESCE(NULLIF(v_item->>'costUsd', '')::NUMERIC, 0),
            COALESCE(NULLIF(v_item->>'isWeight', '')::BOOLEAN, false)
        );
    END LOOP;

    IF v_customer_id IS NOT NULL AND v_fiado_amount > 0 THEN
        UPDATE public.pool_customers
           SET deuda = deuda + v_fiado_amount
         WHERE id = v_customer_id AND user_id = v_user_id;
    END IF;

    FOR v_payment IN
        SELECT * FROM jsonb_to_recordset(COALESCE(payload->'payments', '[]'::JSONB))
            AS x(methodId TEXT, amountUsd NUMERIC)
    LOOP
        IF v_payment.methodId = 'saldo_favor' AND v_customer_id IS NOT NULL THEN
            UPDATE public.pool_customers
               SET favor = GREATEST(0, favor - COALESCE(v_payment.amountUsd, 0))
             WHERE id = v_customer_id AND user_id = v_user_id;
        END IF;
    END LOOP;

    -- El mismo RPC deja un documento durable para que el pull de ventas no
    -- dependa exclusivamente de que Broadcast esté conectado.
    v_sync_payload := payload || jsonb_build_object(
        'id', v_sale_id::TEXT,
        'serverSaleId', v_sale_id::TEXT,
        'saleNumber', v_sale_number,
        'serverSaleNumber', v_sale_number,
        'tipo', v_sale_type,
        'status', 'COMPLETADA',
        'totalUsd', v_total,
        'totalCop', v_total,
        'items', COALESCE(payload->'cart', '[]'::JSONB),
        'timestamp', COALESCE(payload->>'timestamp', NOW()::TEXT),
        'idempotency_key', v_idempotency_key
    );

    INSERT INTO public.sync_documents (
        user_id, collection, doc_id, data, updated_at
    ) VALUES (
        v_user_id,
        'sale',
        v_sale_id::TEXT,
        jsonb_build_object('payload', v_sync_payload),
        NOW()
    )
    ON CONFLICT (user_id, collection, doc_id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'sale_id', v_sale_id,
        'sale_number', v_sale_number,
        'idempotency_key', v_idempotency_key
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_checkout(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_checkout(JSONB) TO authenticated;
