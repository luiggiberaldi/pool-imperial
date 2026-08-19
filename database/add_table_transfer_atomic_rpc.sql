-- Pool Imperial — transferencia atómica e idempotente de mesas
-- Ejecutar después del esquema base, add_table_transfer_metadata.sql y las
-- migraciones de RLS. Esta RPC reemplaza la confirmación fragmentada del cliente
-- para ALL y CONSUMPTION.

ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS transfer_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS transfer_operation_id TEXT,
    ADD COLUMN IF NOT EXISTS transfer_source_item_id UUID;

CREATE TABLE IF NOT EXISTS public.table_transfer_operations (
    operation_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_session_id UUID NOT NULL REFERENCES public.table_sessions(id),
    target_session_id UUID,
    source_table_id UUID NOT NULL REFERENCES public.tables(id),
    target_table_id UUID NOT NULL REFERENCES public.tables(id),
    transfer_type TEXT NOT NULL,
    source_type TEXT,
    target_type TEXT,
    status TEXT NOT NULL DEFAULT 'STARTED',
    frozen_time_usd NUMERIC NOT NULL DEFAULT 0,
    preview_total NUMERIC,
    committed_total NUMERIC,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_payload JSONB,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.table_transfer_operations
    ADD COLUMN IF NOT EXISTS target_session_id UUID,
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS preview_total NUMERIC,
    ADD COLUMN IF NOT EXISTS committed_total NUMERIC,
    ADD COLUMN IF NOT EXISTS error_code TEXT,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.table_transfer_item_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id TEXT NOT NULL REFERENCES public.table_transfer_operations(operation_id) ON DELETE CASCADE,
    source_order_item_id UUID NOT NULL,
    target_order_item_id UUID,
    source_qty NUMERIC NOT NULL DEFAULT 0,
    target_qty_applied NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'APPLIED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (operation_id, source_order_item_id)
);

CREATE TABLE IF NOT EXISTS public.table_transfer_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id TEXT NOT NULL REFERENCES public.table_transfer_operations(operation_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_session_id UUID NOT NULL REFERENCES public.table_sessions(id),
    target_session_id UUID,
    order_id UUID,
    order_item_id UUID,
    charge_type TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    source_elapsed_minutes NUMERIC NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (operation_id, charge_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_transfer_source
    ON public.order_items(transfer_operation_id, transfer_source_item_id)
    WHERE transfer_operation_id IS NOT NULL AND transfer_source_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfer_operations_user_session
    ON public.table_transfer_operations(user_id, source_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_operations_target_status
    ON public.table_transfer_operations(user_id, target_table_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_item_links_source
    ON public.table_transfer_item_links(source_order_item_id);
CREATE INDEX IF NOT EXISTS idx_transfer_charges_session
    ON public.table_transfer_charges(user_id, source_session_id, created_at DESC);

ALTER TABLE public.table_transfer_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_transfer_item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_transfer_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own table transfer operations"
    ON public.table_transfer_operations;
CREATE POLICY "Users can manage own table transfer operations"
    ON public.table_transfer_operations FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own table transfer links"
    ON public.table_transfer_item_links;
CREATE POLICY "Users can manage own table transfer links"
    ON public.table_transfer_item_links FOR ALL
    USING (EXISTS (
        SELECT 1
        FROM public.table_transfer_operations op
        WHERE op.operation_id = table_transfer_item_links.operation_id
          AND op.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.table_transfer_operations op
        WHERE op.operation_id = table_transfer_item_links.operation_id
          AND op.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can manage own table transfer charges"
    ON public.table_transfer_charges;
CREATE POLICY "Users can manage own table transfer charges"
    ON public.table_transfer_charges FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.transfer_table_atomic(
    p_operation_id TEXT,
    p_source_session_id UUID,
    p_target_table_id UUID,
    p_transfer_type TEXT,
    p_plan JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_plan JSONB := COALESCE(p_plan, '{}'::jsonb);
    v_session_patch JSONB := COALESCE(v_plan->'session_patch', '{}'::jsonb);
    v_merge_payload JSONB := COALESCE(v_plan->'merge_payload', '{}'::jsonb);
    v_target_session_from_plan UUID;
    v_source public.table_sessions%ROWTYPE;
    v_source_table public.tables%ROWTYPE;
    v_target_table public.tables%ROWTYPE;
    v_target public.table_sessions%ROWTYPE;
    v_source_order_id UUID;
    v_target_order_id UUID;
    v_target_session_id UUID;
    v_existing_status TEXT;
    v_existing_user_id UUID;
    v_existing_result JSONB;
    v_result JSONB;
    v_result_session JSONB;
    v_frozen NUMERIC := ROUND(GREATEST(COALESCE(NULLIF(v_plan->'frozen'->>'total', '')::NUMERIC, 0), 0), 2);
    v_charge_item_id UUID;
    v_link_target_id UUID;
    v_target_seat_id TEXT;
    v_pair_lock BIGINT;
    v_inserted_operation_count INTEGER := 0;
    v_item public.order_items%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(TRIM(p_operation_id), '') IS NULL THEN
        RAISE EXCEPTION 'operation_id es obligatorio' USING ERRCODE = '22023';
    END IF;
    IF UPPER(p_transfer_type) NOT IN ('ALL', 'CONSUMPTION') THEN
        RAISE EXCEPTION 'Tipo de transferencia no soportado: %', p_transfer_type USING ERRCODE = '22023';
    END IF;

    SELECT status, result_payload, user_id
      INTO v_existing_status, v_existing_result, v_existing_user_id
      FROM public.table_transfer_operations
     WHERE operation_id = p_operation_id
     FOR UPDATE;

    IF FOUND THEN
        IF v_existing_user_id <> v_user_id THEN
            RAISE EXCEPTION 'La operación no pertenece a la cuenta autenticada' USING ERRCODE = '42501';
        END IF;
        IF v_existing_status = 'COMPLETED' AND v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
        RAISE EXCEPTION 'La operación ya está iniciada y requiere reconciliación: %', p_operation_id
            USING ERRCODE = '40001';
    END IF;

    SELECT *
      INTO v_source
      FROM public.table_sessions
     WHERE id = p_source_session_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesión origen no encontrada';
    END IF;
    IF v_source.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'La sesión origen debe estar ACTIVE';
    END IF;

    SELECT *
      INTO v_source_table
      FROM public.tables
     WHERE id = v_source.table_id
       AND user_id = v_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La mesa origen no pertenece a la cuenta';
    END IF;

    SELECT *
      INTO v_target_table
      FROM public.tables
     WHERE id = p_target_table_id
       AND user_id = v_user_id
       AND active = true
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La mesa destino no pertenece a la cuenta o está inactiva';
    END IF;
    IF v_source.table_id = p_target_table_id THEN
        RAISE EXCEPTION 'La mesa destino debe ser diferente a la mesa origen';
    END IF;

    -- Serializa dos dispositivos que intentan mover la misma pareja de mesas en
    -- sentidos opuestos. El orden textual evita deadlocks por inversión de locks.
    v_pair_lock := hashtextextended(
        v_user_id::TEXT || ':' ||
        LEAST(v_source.table_id::TEXT, p_target_table_id::TEXT) || ':' ||
        GREATEST(v_source.table_id::TEXT, p_target_table_id::TEXT),
        0
    );
    PERFORM pg_advisory_xact_lock(v_pair_lock);

    SELECT ts.id
      INTO v_target_session_id
      FROM public.table_sessions ts
     WHERE ts.table_id = p_target_table_id
       AND ts.status IN ('ACTIVE', 'CHECKOUT')
       AND (ts.user_id = v_user_id OR ts.user_id IS NULL)
     ORDER BY ts.started_at, ts.id
     LIMIT 1
     FOR UPDATE;

    IF UPPER(p_transfer_type) = 'ALL' AND v_target_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'La mesa destino está ocupada; usar CONSUMPTION';
    END IF;
    IF UPPER(p_transfer_type) = 'CONSUMPTION' AND v_target_session_id IS NULL THEN
        RAISE EXCEPTION 'La mesa destino debe tener una sesión activa';
    END IF;

    IF v_target_session_id IS NOT NULL THEN
        SELECT * INTO v_target
          FROM public.table_sessions
         WHERE id = v_target_session_id
         FOR UPDATE;
        IF v_target.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'La mesa destino está en CHECKOUT';
        END IF;
    END IF;

    IF NULLIF(v_plan->>'target_session_id', '') IS NOT NULL THEN
        v_target_session_from_plan := (v_plan->>'target_session_id')::UUID;
        IF v_target_session_id IS DISTINCT FROM v_target_session_from_plan THEN
            RAISE EXCEPTION 'La sesión destino cambió mientras se confirmaba la transferencia'
                USING ERRCODE = '40001';
        END IF;
    END IF;

    SELECT o.id
      INTO v_source_order_id
      FROM public.orders o
     WHERE o.table_session_id = p_source_session_id
       AND o.status IN ('OPEN', 'PENDING')
       AND (o.user_id = v_user_id OR o.user_id IS NULL)
     ORDER BY o.created_at, o.id
     LIMIT 1
     FOR UPDATE;

    IF v_target_session_id IS NOT NULL THEN
        SELECT o.id
          INTO v_target_order_id
          FROM public.orders o
         WHERE o.table_session_id = v_target_session_id
           AND o.status IN ('OPEN', 'PENDING')
           AND (o.user_id = v_user_id OR o.user_id IS NULL)
         ORDER BY o.created_at, o.id
         LIMIT 1
         FOR UPDATE;
    END IF;

    INSERT INTO public.table_transfer_operations (
        operation_id, user_id, source_session_id, target_session_id,
        source_table_id, target_table_id, transfer_type,
        source_type, target_type, status, frozen_time_usd,
        preview_total, request_payload
    ) VALUES (
        p_operation_id,
        v_user_id,
        p_source_session_id,
        v_target_session_id,
        v_source.table_id,
        p_target_table_id,
        UPPER(p_transfer_type),
        v_source_table.type,
        v_target_table.type,
        'STARTED',
        v_frozen,
        NULLIF(v_plan->>'preview_total', '')::NUMERIC,
        v_plan
    ) ON CONFLICT (operation_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_operation_count = ROW_COUNT;
    IF v_inserted_operation_count = 0 THEN
        SELECT status, result_payload, user_id
          INTO v_existing_status, v_existing_result, v_existing_user_id
          FROM public.table_transfer_operations
         WHERE operation_id = p_operation_id
         FOR UPDATE;
        IF v_existing_user_id <> v_user_id THEN
            RAISE EXCEPTION 'La operación no pertenece a la cuenta autenticada' USING ERRCODE = '42501';
        END IF;
        IF v_existing_status = 'COMPLETED' AND v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
        RAISE EXCEPTION 'La operación ya está iniciada y requiere reconciliación: %', p_operation_id
            USING ERRCODE = '40001';
    END IF;

    IF UPPER(p_transfer_type) = 'ALL' THEN
        IF v_frozen > 0 AND v_source_order_id IS NULL THEN
            INSERT INTO public.orders (
                table_id, table_session_id, status, total_usd, total_bs,
                exchange_rate_used, created_by, user_id
            ) VALUES (
                p_target_table_id,
                p_source_session_id,
                'OPEN', 0, 0, 1,
                COALESCE(v_plan->>'operator_id', v_user_id::TEXT),
                v_user_id
            ) RETURNING id INTO v_source_order_id;
        END IF;

        IF v_source_order_id IS NOT NULL THEN
            UPDATE public.orders
               SET table_id = p_target_table_id,
                   user_id = COALESCE(user_id, v_user_id)
             WHERE id = v_source_order_id;
        END IF;
    ELSE
        IF v_target_order_id IS NULL THEN
            INSERT INTO public.orders (
                table_id, table_session_id, status, total_usd, total_bs,
                exchange_rate_used, created_by, user_id
            ) VALUES (
                p_target_table_id,
                v_target_session_id,
                'OPEN', 0, 0,
                COALESCE((SELECT exchange_rate_used FROM public.orders WHERE id = v_source_order_id), 1),
                COALESCE(v_plan->>'operator_id', v_user_id::TEXT),
                v_user_id
            ) RETURNING id INTO v_target_order_id;
        END IF;

        IF v_source_order_id IS NOT NULL THEN
            FOR v_item IN
                SELECT oi.*
                  FROM public.order_items oi
                 WHERE oi.order_id = v_source_order_id
                 ORDER BY oi.created_at, oi.id
                 FOR UPDATE
            LOOP
                SELECT target_order_item_id
                  INTO v_link_target_id
                  FROM public.table_transfer_item_links
                 WHERE operation_id = p_operation_id
                   AND source_order_item_id = v_item.id
                 FOR UPDATE;

                IF NOT FOUND THEN
                    v_target_seat_id := v_item.seat_id;
                    IF v_item.seat_id IS NOT NULL AND (v_plan ? 'seat_id_map') THEN
                        v_target_seat_id := COALESCE(
                            v_plan->'seat_id_map'->>v_item.seat_id,
                            v_item.seat_id
                        );
                    END IF;

                    INSERT INTO public.order_items (
                        order_id, product_id, product_name, qty,
                        unit_price_usd, unit_price_bs, seat_id, added_by,
                        transfer_operation_id, transfer_source_item_id
                    ) VALUES (
                        v_target_order_id,
                        v_item.product_id,
                        v_item.product_name,
                        v_item.qty,
                        v_item.unit_price_usd,
                        v_item.unit_price_bs,
                        v_target_seat_id,
                        v_item.added_by,
                        p_operation_id,
                        v_item.id
                    ) RETURNING id INTO v_link_target_id;

                    INSERT INTO public.table_transfer_item_links (
                        operation_id, source_order_item_id, target_order_item_id,
                        source_qty, target_qty_applied
                    ) VALUES (
                        p_operation_id, v_item.id, v_link_target_id,
                        v_item.qty, v_item.qty
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- Cada operación tiene su propio cargo. Un cargo anterior de la misma sesión
    -- nunca bloquea el cargo nuevo de una operación posterior.
    IF v_frozen > 0 THEN
        SELECT order_item_id
          INTO v_charge_item_id
          FROM public.table_transfer_charges
         WHERE operation_id = p_operation_id
           AND charge_type = 'POOL_TIME'
         FOR UPDATE;

        IF v_charge_item_id IS NULL THEN
            IF UPPER(p_transfer_type) = 'ALL' THEN
                IF v_source_order_id IS NULL THEN
                    RAISE EXCEPTION 'No se pudo crear la orden del cargo congelado';
                END IF;
            ELSE
                IF v_target_order_id IS NULL THEN
                    RAISE EXCEPTION 'No se pudo crear la orden destino del cargo congelado';
                END IF;
            END IF;

            INSERT INTO public.order_items (
                order_id, product_id, product_name, qty,
                unit_price_usd, unit_price_bs, added_by,
                transfer_operation_id
            ) VALUES (
                CASE WHEN UPPER(p_transfer_type) = 'ALL' THEN v_source_order_id ELSE v_target_order_id END,
                'frozen-time-' || p_operation_id,
                COALESCE(v_plan->'frozen'->'productInfo'->>'name', 'Tiempo de juego Pool (cargo congelado)'),
                1,
                v_frozen,
                NULL,
                COALESCE(v_plan->>'operator_id', v_user_id::TEXT),
                p_operation_id
            ) RETURNING id INTO v_charge_item_id;

            INSERT INTO public.table_transfer_charges (
                operation_id, user_id, source_session_id, target_session_id,
                order_id, order_item_id, charge_type, amount,
                source_elapsed_minutes, metadata
            ) VALUES (
                p_operation_id,
                v_user_id,
                p_source_session_id,
                v_target_session_id,
                CASE WHEN UPPER(p_transfer_type) = 'ALL' THEN v_source_order_id ELSE v_target_order_id END,
                v_charge_item_id,
                'POOL_TIME',
                v_frozen,
                COALESCE(NULLIF(v_plan->>'source_elapsed_minutes', '')::NUMERIC, 0),
                COALESCE(v_plan->'frozen', '{}'::jsonb)
            );
        END IF;
    END IF;

    IF UPPER(p_transfer_type) = 'ALL' THEN
        UPDATE public.table_sessions
           SET table_id = p_target_table_id,
               started_at = CASE WHEN v_session_patch ? 'started_at'
                   THEN NULLIF(v_session_patch->>'started_at', '')::TIMESTAMPTZ ELSE started_at END,
               game_mode = COALESCE(v_session_patch->>'game_mode', game_mode),
               hours_paid = CASE WHEN v_session_patch ? 'hours_paid'
                   THEN COALESCE(NULLIF(v_session_patch->>'hours_paid', '')::NUMERIC, 0) ELSE hours_paid END,
               extended_times = CASE WHEN v_session_patch ? 'extended_times'
                   THEN COALESCE(NULLIF(v_session_patch->>'extended_times', '')::INTEGER, 0) ELSE extended_times END,
               paid_at = CASE WHEN v_session_patch ? 'paid_at'
                   THEN NULLIF(v_session_patch->>'paid_at', '')::TIMESTAMPTZ ELSE paid_at END,
               paused_at = CASE WHEN v_session_patch ? 'paused_at'
                   THEN NULLIF(v_session_patch->>'paused_at', '')::TIMESTAMPTZ ELSE paused_at END,
               seats = CASE WHEN v_session_patch ? 'seats'
                   THEN COALESCE(v_session_patch->'seats', '[]'::jsonb) ELSE seats END,
               notes = CASE WHEN v_session_patch ? 'notes'
                   THEN NULLIF(v_session_patch->>'notes', '') ELSE notes END,
               transfer_metadata = CASE WHEN v_session_patch ? 'transfer_metadata'
                   THEN COALESCE(v_session_patch->'transfer_metadata', '{}'::jsonb) ELSE transfer_metadata END,
               user_id = COALESCE(user_id, v_user_id)
         WHERE id = p_source_session_id;
    ELSE
        UPDATE public.table_sessions
           SET seats = CASE WHEN v_merge_payload ? 'seats'
                   THEN COALESCE(v_merge_payload->'seats', '[]'::jsonb) ELSE seats END,
               guest_count = CASE WHEN v_merge_payload ? 'guest_count'
                   THEN COALESCE(NULLIF(v_merge_payload->>'guest_count', '')::INTEGER, 0) ELSE guest_count END,
               client_name = CASE WHEN v_merge_payload ? 'client_name'
                   THEN NULLIF(v_merge_payload->>'client_name', '') ELSE client_name END,
               client_id = CASE WHEN v_merge_payload ? 'client_id'
                   THEN NULLIF(v_merge_payload->>'client_id', '')::UUID ELSE client_id END,
               notes = CASE WHEN v_merge_payload ? 'notes'
                   THEN NULLIF(v_merge_payload->>'notes', '') ELSE notes END,
               user_id = COALESCE(user_id, v_user_id)
         WHERE id = v_target_session_id;

        UPDATE public.table_sessions
           SET status = 'CLOSED',
               closed_at = NOW(),
               paused_at = NULL,
               paid_at = NULL,
               total_cost_usd = 0
         WHERE id = p_source_session_id;

        IF v_source_order_id IS NOT NULL THEN
            UPDATE public.orders
               SET status = 'CANCELLED'
             WHERE id = v_source_order_id;
        END IF;
    END IF;

    IF UPPER(p_transfer_type) = 'ALL' THEN
        SELECT to_jsonb(ts) INTO v_result_session
          FROM public.table_sessions ts
         WHERE ts.id = p_source_session_id;
    ELSE
        SELECT to_jsonb(ts) INTO v_result_session
          FROM public.table_sessions ts
         WHERE ts.id = v_target_session_id;
    END IF;

    v_result := jsonb_build_object(
        'operation_id', p_operation_id,
        'status', 'COMPLETED',
        'source_session_id', p_source_session_id,
        'target_session_id', v_target_session_id,
        'target_table_id', p_target_table_id,
        'transfer_type', UPPER(p_transfer_type),
        'source_order_id', v_source_order_id,
        'target_order_id', CASE WHEN UPPER(p_transfer_type) = 'ALL' THEN v_source_order_id ELSE v_target_order_id END,
        'frozen_time_usd', v_frozen,
        'session', v_result_session
    );

    UPDATE public.table_transfer_operations
       SET status = 'COMPLETED',
           target_session_id = v_target_session_id,
           committed_total = v_frozen,
           result_payload = v_result,
           completed_at = NOW()
     WHERE operation_id = p_operation_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_table_atomic(TEXT, UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_table_atomic(TEXT, UUID, UUID, TEXT, JSONB) TO authenticated;
