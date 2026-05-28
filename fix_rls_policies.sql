-- ============================================================================
-- FIX RLS POLICIES — Reemplazar políticas "permitir todo" por auth-based
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── cloud_backups ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a cloud_backups" ON public.cloud_backups;

CREATE POLICY "Owner can manage own backups"
    ON public.cloud_backups FOR ALL
    USING (email = (auth.jwt()->>'email'))
    WITH CHECK (email = (auth.jwt()->>'email'));

-- ── cloud_licenses ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a cloud_licenses" ON public.cloud_licenses;

CREATE POLICY "Owner can read own license"
    ON public.cloud_licenses FOR SELECT
    USING (email = (auth.jwt()->>'email'));

CREATE POLICY "Owner can update own license"
    ON public.cloud_licenses FOR UPDATE
    USING (email = (auth.jwt()->>'email'))
    WITH CHECK (email = (auth.jwt()->>'email'));

-- ── account_devices ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a account_devices" ON public.account_devices;

CREATE POLICY "Owner can manage own devices"
    ON public.account_devices FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ── sync_documents ──────────────────────────────────────────────────────────
-- Verificar si ya existe una política restrictiva
DROP POLICY IF EXISTS "Users can manage own sync docs" ON public.sync_documents;
DROP POLICY IF EXISTS "Permitir todo a sync_documents" ON public.sync_documents;

CREATE POLICY "Users can manage own sync docs"
    ON public.sync_documents FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ── cash_sessions ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Acceso completo a cash_sessions" ON public.cash_sessions;

CREATE POLICY "Authenticated users can manage cash sessions"
    ON public.cash_sessions FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ── sales ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sales' AND policyname = 'Auth users can manage sales'
    ) THEN
        CREATE POLICY "Auth users can manage sales"
            ON public.sales FOR ALL
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- ── sale_items ──────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sale_items' AND policyname = 'Auth users can manage sale items'
    ) THEN
        CREATE POLICY "Auth users can manage sale items"
            ON public.sale_items FOR ALL
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- ── orders ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Auth users can manage orders'
    ) THEN
        CREATE POLICY "Auth users can manage orders"
            ON public.orders FOR ALL
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- ── order_items ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'Auth users can manage order items'
    ) THEN
        CREATE POLICY "Auth users can manage order items"
            ON public.order_items FOR ALL
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- ── products ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Auth users can manage products'
    ) THEN
        CREATE POLICY "Auth users can manage products"
            ON public.products FOR ALL
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- ── payments ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Auth users can manage payments'
    ) THEN
        CREATE POLICY "Auth users can manage payments"
            ON public.payments FOR ALL
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- ✅ Verificación: Ejecutar esto después para confirmar
-- SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
