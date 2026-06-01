-- ============================================================================
-- 🎱 POOL IMPERIAL — ESQUEMA COMPLETO DE BASE DE DATOS (COLOMBIA - COP)
-- Ejecutar este script en el SQL Editor del nuevo proyecto Supabase:
-- https://abbrcppmwsmxhoaxkgsh.supabase.co
-- ============================================================================

-- Habilitar extensión pgcrypto para generar UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. cloud_licenses & Estación Maestra ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cloud_licenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    device_id TEXT,
    license_type TEXT NOT NULL DEFAULT 'trial',
    days_remaining INTEGER DEFAULT 7,
    valid_until TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    max_devices INTEGER NOT NULL DEFAULT 2,
    active BOOLEAN NOT NULL DEFAULT true,
    business_name TEXT,
    phone TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cloud_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    backup_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.device_backups (
    device_id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    backup_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_alias TEXT DEFAULT 'Dispositivo',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID,
    UNIQUE(email, device_id)
);

-- ── 2. sync_documents (Offline-First Catalog) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collection TEXT NOT NULL, -- 'store' o 'local'
    doc_id TEXT NOT NULL,      -- e.g. 'pool_imperial_products_v1'
    data JSONB NOT NULL,       -- Carga útil
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, collection, doc_id)
);

-- ── 3. Tablas de Control de Mesas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'POOL', -- 'POOL' o 'NORMAL' (Bar)
    hourly_rate NUMERIC NOT NULL DEFAULT 0, -- Tarifa en COP por hora
    active BOOLEAN NOT NULL DEFAULT true,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'CHECKOUT', 'CLOSED'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    client_name TEXT,
    client_id UUID,
    notes TEXT,
    hours_paid NUMERIC DEFAULT 0,
    extended_times INTEGER DEFAULT 0,
    seats JSONB DEFAULT '[]',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    game_mode TEXT NOT NULL DEFAULT 'NORMAL',
    opened_by TEXT,
    guest_count INTEGER DEFAULT 0,
    total_cost_usd NUMERIC DEFAULT 0,
    payment_method TEXT
);

-- ── 4. Órdenes y Consumo en Mesas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id UUID, -- Guardado para retrocompatibilidad
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'CANCELLED'
    exchange_rate_used NUMERIC DEFAULT 1,
    total_usd NUMERIC DEFAULT 0,
    total_bs NUMERIC DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    qty NUMERIC NOT NULL DEFAULT 1,
    unit_price_usd NUMERIC NOT NULL DEFAULT 0, -- NOTA: Almacena pesos COP por compatibilidad de esquema
    unit_price_bs NUMERIC DEFAULT NULL, -- Guardado para retrocompatibilidad
    seat_id TEXT,
    added_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 5. Caja Registradora ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN' o 'CLOSED'
    initial_cash_usd NUMERIC DEFAULT 0,  -- Almacena COP por compatibilidad
    final_cash_usd NUMERIC DEFAULT 0,    -- Almacena COP por compatibilidad
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ── 6. Gestión de Clientes, Proveedores e Hilos de Personal ─────────────────
CREATE TABLE IF NOT EXISTS public.pool_customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    document_id TEXT, -- NIT / C.C.
    deuda NUMERIC DEFAULT 0, -- Fiado acumulado en COP
    favor NUMERIC DEFAULT 0, -- Saldo a favor en COP
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.staff_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'MESERO', -- 'ADMIN', 'CAJERO', 'MESERO', 'BARRA'
    active BOOLEAN NOT NULL DEFAULT true,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_debts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id UUID NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    concept TEXT NOT NULL,
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    remaining_usd NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' or 'paid'
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_debt_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    debt_id UUID NOT NULL REFERENCES public.staff_debts(id) ON DELETE CASCADE,
    amount_usd NUMERIC NOT NULL DEFAULT 0, -- Abono en USD
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ── 7. Motor de Ventas Históricas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_number INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'VENTA', -- 'VENTA' o 'VENTA_FIADA'
    status TEXT NOT NULL DEFAULT 'COMPLETADA', -- 'COMPLETADA', 'PENDIENTE_SYNC'
    vendedor_id UUID,
    vendedor_nombre TEXT,
    vendedor_rol TEXT,
    mesero_id UUID,
    mesero_nombre TEXT,
    table_name TEXT,
    cart_subtotal_usd NUMERIC DEFAULT 0, -- Almacena COP
    discount_type TEXT,
    discount_value NUMERIC DEFAULT 0,
    discount_amount_usd NUMERIC DEFAULT 0, -- Almacena COP
    total_usd NUMERIC DEFAULT 0, -- Almacena COP
    total_bs NUMERIC DEFAULT 0, -- Siempre 0 en Colombia
    total_cop NUMERIC DEFAULT 0, -- Explícito COP
    rate NUMERIC DEFAULT 1,
    rate_source TEXT DEFAULT 'COP',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    change_usd NUMERIC DEFAULT 0, -- Vuelto COP dado
    change_bs NUMERIC DEFAULT 0,  -- Siempre 0
    customer_id UUID,
    customer_name TEXT,
    customer_document TEXT,
    customer_phone TEXT,
    fiado_usd NUMERIC DEFAULT 0, -- COP cargado a cuenta
    split_meta JSONB,
    idempotency_key UUID,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC NOT NULL DEFAULT 1,
    price_usd NUMERIC NOT NULL DEFAULT 0, -- Almacena COP
    cost_usd NUMERIC NOT NULL DEFAULT 0,  -- Almacena COP
    is_weight BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 8. Configuración Global de la App y Licencias Legadas ────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT,
    product_id TEXT,
    type TEXT DEFAULT 'permanent',
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pool_config (
    id INTEGER NOT NULL DEFAULT 1,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    price_per_hour NUMERIC DEFAULT 0,
    price_per_hour_bs NUMERIC DEFAULT 0,
    price_pina NUMERIC DEFAULT 0,
    price_pina_bs NUMERIC DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id, user_id)
);

-- ── 9. RLS (Row Level Security) e Índices ────────────────────────────────────
ALTER TABLE public.cloud_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_config ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública
CREATE POLICY "Public can read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Public read licenses" ON public.licenses FOR SELECT USING (true);

-- Políticas de Propietario (user_id)
CREATE POLICY "Users can manage own sync docs" ON public.sync_documents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own tables" ON public.tables FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own table sessions" ON public.table_sessions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own orders" ON public.orders FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own cash sessions" ON public.cash_sessions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own customers" ON public.pool_customers FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own staff" ON public.staff_users FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own debts" ON public.staff_debts FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own debt payments" ON public.staff_debt_payments FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own sales" ON public.sales FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own pool config" ON public.pool_config FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Políticas para Estación Maestra (JWT email - Insensibilidad a Mayúsculas)
CREATE POLICY "Owner can manage own backups" ON public.cloud_backups FOR ALL USING (LOWER(email) = LOWER(auth.jwt()->>'email')) WITH CHECK (LOWER(email) = LOWER(auth.jwt()->>'email'));
CREATE POLICY "Owner can read own license" ON public.cloud_licenses FOR SELECT USING (LOWER(email) = LOWER(auth.jwt()->>'email'));
CREATE POLICY "Owner can update own license" ON public.cloud_licenses FOR UPDATE USING (LOWER(email) = LOWER(auth.jwt()->>'email')) WITH CHECK (LOWER(email) = LOWER(auth.jwt()->>'email'));
CREATE POLICY "Owner can manage own devices" ON public.account_devices FOR ALL USING (LOWER(email) = LOWER(auth.jwt()->>'email')) WITH CHECK (LOWER(email) = LOWER(auth.jwt()->>'email'));

-- Políticas heredadas de seguridad por tablas asociadas
CREATE POLICY "Auth users can manage order items" ON public.order_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users can manage sale items" ON public.sale_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_sync_documents_user ON public.sync_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_tables_user_active ON public.tables(user_id, active);
CREATE INDEX IF NOT EXISTS idx_table_sessions_user_status ON public.table_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON public.orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_status ON public.cash_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_user ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_users_user_active ON public.staff_users(user_id, active);
CREATE INDEX IF NOT EXISTS idx_staff_debts_user ON public.staff_debts(user_id);

-- ── 10. Función de Registro de Dispositivo (Check License) ────────────────────
CREATE OR REPLACE FUNCTION public.register_and_check_device(
    p_email TEXT,
    p_device_id TEXT,
    p_device_alias TEXT DEFAULT 'Dispositivo'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_max_devices INTEGER;
    v_active BOOLEAN;
    v_license_type TEXT;
    v_valid_until TIMESTAMP WITH TIME ZONE;
    v_count INTEGER;
    v_already_registered BOOLEAN;
BEGIN
    SELECT max_devices, active, license_type, valid_until INTO v_max_devices, v_active, v_license_type, v_valid_until
    FROM public.cloud_licenses
    WHERE LOWER(email) = LOWER(p_email);

    IF NOT FOUND THEN
        RETURN 'ok';
    END IF;

    IF v_active = false THEN
        RETURN 'license_inactive';
    END IF;

    IF v_license_type != 'permanent' AND v_valid_until < NOW() THEN
        RETURN 'license_expired';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.account_devices
    WHERE LOWER(email) = LOWER(p_email);

    IF v_count > v_max_devices THEN
        RETURN 'limit_reached';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.account_devices
        WHERE LOWER(email) = LOWER(p_email) AND device_id = p_device_id
    ) INTO v_already_registered;

    IF v_already_registered THEN
        UPDATE public.account_devices
        SET last_seen = NOW(),
            user_id = auth.uid()
        WHERE LOWER(email) = LOWER(p_email) AND device_id = p_device_id;
        RETURN 'ok';
    END IF;

    IF v_count >= v_max_devices THEN
        RETURN 'limit_reached';
    END IF;

    INSERT INTO public.account_devices (email, device_id, device_alias, last_seen, user_id)
    VALUES (LOWER(p_email), p_device_id, p_device_alias, NOW(), auth.uid())
    ON CONFLICT (email, device_id) DO UPDATE SET last_seen = NOW(), user_id = auth.uid();

    RETURN 'ok';
END;
$$;

-- ── 11. Función RPC: process_checkout (Motor Transaccional Seguro) ─────────────
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

    v_customer_id := (payload->>'customerId')::UUID;
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
        user_id
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
        (payload->>'idempotency_key')::UUID,
        v_user_id
    ) RETURNING id INTO v_sale_id;

    -- Insertar ítems vendidos
    FOR v_item IN SELECT * FROM jsonb_to_recordset(payload->'cart') AS x(id TEXT, qty NUMERIC, priceUsd NUMERIC) LOOP
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
            (SELECT COALESCE(name, 'Producto') FROM public.sync_documents WHERE collection = 'store' AND doc_id = 'pool_imperial_products_v1' AND user_id = v_user_id AND data->'payload' @> jsonb_build_array(jsonb_build_object('id', v_item.id)) LIMIT 1),
            v_item.qty,
            v_item.priceUsd,
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
