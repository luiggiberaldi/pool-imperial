-- ============================================================================
-- 🎱 POOL IMPERIAL — ACTUALIZAR RPC process_checkout
-- Ejecutar este script en el SQL Editor de tu proyecto Supabase:
-- https://abbrcppmwsmxhoaxkgsh.supabase.co
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_checkout(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_sale_number INTEGER;
    v_user_id UUID;
    v_customer_id UUID;
    v_vendedor_id UUID;
    v_mesero_id UUID;
    v_idempotency_key UUID;
    v_fiado_amount NUMERIC;
    v_item RECORD;
    v_payment RECORD;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
    END IF;

    -- Obtener siguiente número de venta para el usuario
    SELECT COALESCE(MAX(sale_number), 0) + 1 INTO v_sale_number
    FROM public.sales
    WHERE user_id = v_user_id;

    -- Validar y castear de forma segura customerId
    IF payload->>'customerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_customer_id := (payload->>'customerId')::UUID;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- Validar y castear de forma segura vendedorId
    IF payload->>'vendedorId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_vendedor_id := (payload->>'vendedorId')::UUID;
    ELSE
        v_vendedor_id := NULL;
    END IF;

    -- Validar y castear de forma segura meseroId
    IF payload->>'meseroId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_mesero_id := (payload->>'meseroId')::UUID;
    ELSE
        v_mesero_id := NULL;
    END IF;

    -- Validar y castear de forma segura idempotency_key
    IF payload->>'idempotency_key' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_idempotency_key := (payload->>'idempotency_key')::UUID;
    ELSE
        v_idempotency_key := gen_random_uuid();
    END IF;

    v_fiado_amount := COALESCE((payload->>'fiadoUsd')::NUMERIC, 0);

    -- Insertar venta principal
    INSERT INTO public.sales (
        sale_number,
        tipo,
        status,
        cart_subtotal_usd,
        discount_type,
        discount_value,
        discount_amount_usd,
        total_usd,
        total_bs,
        total_cop,
        rate,
        rate_source,
        change_usd,
        change_bs,
        customer_id,
        customer_name,
        customer_document,
        customer_phone,
        fiado_usd,
        split_meta,
        idempotency_key,
        user_id,
        vendedor_id,
        vendedor_nombre,
        vendedor_rol,
        mesero_id,
        mesero_nombre,
        table_name
    ) VALUES (
        v_sale_number,
        CASE WHEN v_fiado_amount > 0 THEN 'VENTA_FIADA' ELSE 'VENTA' END,
        'COMPLETADA',
        (payload->>'total')::NUMERIC,
        payload->>'discountType',
        COALESCE((payload->>'discountValue')::NUMERIC, 0),
        COALESCE((payload->>'discountAmountUsd')::NUMERIC, 0),
        (payload->>'total')::NUMERIC,
        0,
        (payload->>'total')::NUMERIC,
        1,
        'COP',
        COALESCE((payload->>'changeUsdGiven')::NUMERIC, 0),
        0,
        v_customer_id,
        payload->>'customerName',
        payload->>'customerDocument',
        payload->>'customerPhone',
        v_fiado_amount,
        payload->'splitMeta',
        v_idempotency_key,
        v_user_id,
        v_vendedor_id,
        payload->>'vendedorNombre',
        payload->>'vendedorRol',
        v_mesero_id,
        payload->>'meseroNombre',
        payload->>'tableName'
    ) RETURNING id INTO v_sale_id;

    -- Insertar ítems vendidos (usando el nombre enviado desde el cliente y protegiendo contra nulos o problemas de casing en price_usd)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(payload->'cart') AS x(id TEXT, qty NUMERIC, priceUsd NUMERIC, "priceUsd" NUMERIC, price_usd NUMERIC, name TEXT) LOOP
        INSERT INTO public.sale_items (
            sale_id,
            product_id,
            name,
            qty,
            price_usd,
            cost_usd,
            is_weight
        ) VALUES (
            v_sale_id,
            v_item.id,
            COALESCE(v_item.name, 'Producto'),
            v_item.qty,
            COALESCE(v_item.price_usd, v_item.priceUsd, v_item."priceUsd", 0),
            0,
            false
        );
    END LOOP;

    -- Actualizar fiado del cliente si aplica
    IF v_customer_id IS NOT NULL AND v_fiado_amount > 0 THEN
        UPDATE public.pool_customers
        SET deuda = deuda + v_fiado_amount
        WHERE id = v_customer_id AND user_id = v_user_id;
    END IF;

    -- Actualizar saldo a favor usado
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(payload->'payments') AS x(methodId TEXT, amountUsd NUMERIC) LOOP
        IF v_payment.methodId = 'saldo_favor' AND v_customer_id IS NOT NULL THEN
            UPDATE public.pool_customers
            SET favor = GREATEST(0, favor - v_payment.amountUsd)
            WHERE id = v_customer_id AND user_id = v_user_id;
        END IF;
    END LOOP;

    v_result := jsonb_build_object('success', true, 'sale_id', v_sale_id, 'sale_number', v_sale_number);
    RETURN v_result;
END;
$$;
