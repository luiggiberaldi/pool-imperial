-- ============================================================================
-- Pool Imperial: Pool → Normal transacción atómica
-- Requiere ejecutar antes: add_table_transfer_metadata.sql
--
-- La RPC recibe el importe de preview como medida de transición. La validación
-- definitiva del importe contra un ledger durable de pagos queda documentada en
-- PLAN_MEJORAS_POOL_NORMAL.md y debe reemplazar este parámetro antes de confiar
-- en el cálculo del cliente como fuente fiscal autoritativa.
-- ============================================================================

-- La RPC limpia una pausa durable al cambiar el contexto de cobro. Esta línea
-- hace la migración autocontenida incluso si la instalación aún no ejecutó
-- add_paused_at_to_table_sessions.sql.
ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.table_transfer_operations (
    operation_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_session_id UUID NOT NULL REFERENCES public.table_sessions(id),
    source_table_id UUID NOT NULL REFERENCES public.tables(id),
    target_table_id UUID NOT NULL REFERENCES public.tables(id),
    transfer_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'STARTED',
    frozen_time_usd NUMERIC NOT NULL DEFAULT 0,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.table_transfer_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own table transfer operations"
    ON public.table_transfer_operations;
CREATE POLICY "Users can manage own table transfer operations"
    ON public.table_transfer_operations
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_table_transfer_operations_user
    ON public.table_transfer_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_table_transfer_operations_session
    ON public.table_transfer_operations(source_session_id, status);

CREATE OR REPLACE FUNCTION public.transfer_pool_to_normal_atomic(
    p_operation_id TEXT,
    p_source_session_id UUID,
    p_target_table_id UUID,
    p_operator_id TEXT DEFAULT NULL,
    p_frozen_time_usd NUMERIC DEFAULT 0,
    p_transfer_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_source public.table_sessions%ROWTYPE;
    v_source_table public.tables%ROWTYPE;
    v_target_table public.tables%ROWTYPE;
    v_target_session_id UUID;
    v_order_id UUID;
    v_item_id UUID;
    v_clean_seats JSONB;
    v_metadata JSONB;
    v_notes TEXT;
    v_existing_status TEXT;
    v_existing_result JSONB;
    v_existing_user_id UUID;
    v_result JSONB;
    v_frozen NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
    END IF;

    IF p_operation_id IS NULL OR length(trim(p_operation_id)) = 0 THEN
        RAISE EXCEPTION 'operation_id es obligatorio';
    END IF;

    v_frozen := round(GREATEST(COALESCE(p_frozen_time_usd, 0), 0), 2);
    IF COALESCE(p_frozen_time_usd, 0) < 0 THEN
        RAISE EXCEPTION 'El importe congelado no puede ser negativo';
    END IF;

    -- Reintento idempotente: devolver exactamente el resultado original.
    SELECT status, result_payload, user_id
      INTO v_existing_status, v_existing_result, v_existing_user_id
      FROM public.table_transfer_operations
     WHERE operation_id = p_operation_id
     FOR UPDATE;

    IF FOUND THEN
        IF v_existing_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'La operación no pertenece a la cuenta autenticada';
        END IF;
        IF v_existing_status = 'COMPLETED' AND v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
        RAISE EXCEPTION 'La operación ya está iniciada y requiere reconciliación: %', p_operation_id;
    END IF;

    -- El bloqueo de la mesa también valida la cuenta cuando sesiones antiguas
    -- tienen user_id NULL: la mesa es la frontera de aislamiento autoritativa.
    SELECT ts.*
      INTO v_source
      FROM public.table_sessions ts
      JOIN public.tables st ON st.id = ts.table_id
     WHERE ts.id = p_source_session_id
       AND st.user_id = auth.uid()
     FOR UPDATE OF ts;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesión Pool origen no encontrada';
    END IF;
    IF v_source.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'La sesión origen debe estar ACTIVE';
    END IF;

    SELECT *
      INTO v_source_table
      FROM public.tables
     WHERE id = v_source.table_id
       AND user_id = auth.uid()
     FOR UPDATE;
    IF NOT FOUND OR v_source_table.type <> 'POOL' THEN
        RAISE EXCEPTION 'La mesa origen no es una mesa Pool válida';
    END IF;

    SELECT *
      INTO v_target_table
      FROM public.tables
     WHERE id = p_target_table_id
       AND user_id = auth.uid()
       AND active = true
     FOR UPDATE;
    IF NOT FOUND OR v_target_table.type <> 'NORMAL' THEN
        RAISE EXCEPTION 'La mesa destino no es una mesa Normal activa';
    END IF;
    IF v_source.table_id = p_target_table_id THEN
        RAISE EXCEPTION 'La mesa destino debe ser diferente';
    END IF;

    SELECT ts.id
      INTO v_target_session_id
      FROM public.table_sessions ts
     WHERE ts.table_id = p_target_table_id
       AND ts.status IN ('ACTIVE', 'CHECKOUT')
       AND (ts.user_id = auth.uid() OR ts.user_id IS NULL)
     ORDER BY ts.started_at
     LIMIT 1
     FOR UPDATE;
    IF v_target_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'La mesa Normal destino está ocupada; usar la operación de fusión';
    END IF;

    INSERT INTO public.table_transfer_operations (
        operation_id,
        user_id,
        source_session_id,
        source_table_id,
        target_table_id,
        transfer_type,
        status,
        frozen_time_usd,
        request_payload
    ) VALUES (
        p_operation_id,
        auth.uid(),
        p_source_session_id,
        v_source.table_id,
        p_target_table_id,
        'ALL',
        'STARTED',
        v_frozen,
        jsonb_build_object(
            'operator_id', p_operator_id,
            'frozen_time_usd', v_frozen,
            'metadata', COALESCE(p_transfer_metadata, '{}'::jsonb)
        )
    );

    -- Reutilizar la comanda abierta de la sesión o crearla únicamente si hay
    -- un cargo fijo que guardar.
    SELECT o.id
      INTO v_order_id
      FROM public.orders o
     WHERE o.table_session_id = p_source_session_id
       AND o.status IN ('OPEN', 'PENDING')
     ORDER BY o.created_at
     LIMIT 1
     FOR UPDATE;

    IF v_frozen > 0 AND v_order_id IS NULL THEN
        INSERT INTO public.orders (
            table_id,
            table_session_id,
            status,
            total_usd,
            total_bs,
            exchange_rate_used,
            created_by,
            user_id
        ) VALUES (
            v_source.table_id,
            p_source_session_id,
            'OPEN',
            0,
            0,
            1,
            COALESCE(p_operator_id, auth.uid()::TEXT),
            auth.uid()
        )
        RETURNING id INTO v_order_id;
    END IF;

    IF v_frozen > 0 THEN
        SELECT oi.id
          INTO v_item_id
          FROM public.order_items oi
         WHERE oi.order_id = v_order_id
           AND oi.product_id = 'frozen-time-' || p_source_session_id::TEXT
         LIMIT 1
         FOR UPDATE;

        IF v_item_id IS NULL THEN
            INSERT INTO public.order_items (
                order_id,
                product_id,
                product_name,
                qty,
                unit_price_usd,
                unit_price_bs,
                added_by
            ) VALUES (
                v_order_id,
                'frozen-time-' || p_source_session_id::TEXT,
                'Tiempo de juego Pool (cargo congelado)',
                1,
                v_frozen,
                NULL,
                p_operator_id
            );
        END IF;
    END IF;

    IF v_order_id IS NOT NULL THEN
        UPDATE public.orders
           SET table_id = p_target_table_id
         WHERE id = v_order_id;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            CASE
                WHEN jsonb_typeof(seat_row.seat -> 'timeCharges') = 'array'
                THEN jsonb_set(seat_row.seat, '{timeCharges}', '[]'::jsonb, true)
                ELSE seat_row.seat
            END
            ORDER BY seat_row.ordinality
        ),
        '[]'::jsonb
    )
      INTO v_clean_seats
      FROM jsonb_array_elements(COALESCE(v_source.seats, '[]'::jsonb))
           WITH ORDINALITY AS seat_row(seat, ordinality);

    v_metadata := COALESCE(p_transfer_metadata, '{}'::jsonb) || jsonb_build_object(
        'operation_id', p_operation_id,
        'source_type', 'POOL',
        'target_type', 'NORMAL',
        'source_started_at', v_source.started_at,
        'transferred_at', NOW(),
        'frozen_time_usd', v_frozen
    );

    v_notes := regexp_replace(
        COALESCE(v_source.notes, ''),
        '\|\|\|TRANSFER_OPERATION_ID:[^|]*\|\|\|',
        '',
        'g'
    );
    v_notes := trim(v_notes);
    v_notes := v_notes || CASE WHEN v_notes = '' THEN '' ELSE ' ' END
        || '|||TRANSFER_OPERATION_ID:' || p_operation_id || '|||';

    UPDATE public.table_sessions
       SET table_id = p_target_table_id,
           started_at = NOW(),
           game_mode = 'NORMAL',
           hours_paid = 0,
           extended_times = 0,
           paid_at = NULL,
           paused_at = NULL,
           seats = v_clean_seats,
           notes = v_notes,
           transfer_metadata = v_metadata,
           user_id = COALESCE(v_source.user_id, auth.uid())
     WHERE id = p_source_session_id;

    SELECT jsonb_build_object(
        'operation_id', p_operation_id,
        'source_session_id', p_source_session_id,
        'target_table_id', p_target_table_id,
        'order_id', v_order_id,
        'frozen_time_usd', v_frozen,
        'session', to_jsonb(ts)
    )
      INTO v_result
      FROM public.table_sessions ts
     WHERE ts.id = p_source_session_id;

    UPDATE public.table_transfer_operations
       SET status = 'COMPLETED',
           result_payload = v_result,
           completed_at = NOW()
     WHERE operation_id = p_operation_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_pool_to_normal_atomic(TEXT, UUID, UUID, TEXT, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_pool_to_normal_atomic(TEXT, UUID, UUID, TEXT, NUMERIC, JSONB) TO authenticated;
