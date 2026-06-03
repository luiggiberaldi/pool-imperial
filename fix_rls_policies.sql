-- ============================================================================
-- FIX RLS POLICIES — Reemplazar políticas "permitir todo" por auth-based
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── cloud_backups ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a cloud_backups" ON public.cloud_backups;
DROP POLICY IF EXISTS "Owner can manage own backups" ON public.cloud_backups;

CREATE POLICY "Owner can manage own backups"
    ON public.cloud_backups FOR ALL
    USING (email = (auth.jwt()->>'email'))
    WITH CHECK (email = (auth.jwt()->>'email'));

-- ── cloud_licenses ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a cloud_licenses" ON public.cloud_licenses;
DROP POLICY IF EXISTS "Owner can read own license" ON public.cloud_licenses;
DROP POLICY IF EXISTS "Owner can update own license" ON public.cloud_licenses;

CREATE POLICY "Owner can read own license"
    ON public.cloud_licenses FOR SELECT
    USING (email = (auth.jwt()->>'email'));

CREATE POLICY "Owner can update own license"
    ON public.cloud_licenses FOR UPDATE
    USING (email = (auth.jwt()->>'email'))
    WITH CHECK (email = (auth.jwt()->>'email'));

-- ── account_devices ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a account_devices" ON public.account_devices;
DROP POLICY IF EXISTS "Owner can manage own devices" ON public.account_devices;

CREATE POLICY "Owner can manage own devices"
    ON public.account_devices FOR ALL
    USING (LOWER(email) = LOWER(auth.jwt()->>'email'))
    WITH CHECK (LOWER(email) = LOWER(auth.jwt()->>'email'));

-- ── sync_documents ──────────────────────────────────────────────────────────
-- Verificar si ya existe una política restrictiva
DROP POLICY IF EXISTS "Users can manage own sync docs" ON public.sync_documents;
DROP POLICY IF EXISTS "Permitir todo a sync_documents" ON public.sync_documents;

CREATE POLICY "Users can manage own sync docs"
    ON public.sync_documents FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ── cash_sessions ───────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_sessions') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Acceso completo a cash_sessions" ON public.cash_sessions';
        EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can manage cash sessions" ON public.cash_sessions';
        EXECUTE 'CREATE POLICY "Authenticated users can manage cash sessions" ON public.cash_sessions FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ── sales ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Auth users can manage sales" ON public.sales';
        EXECUTE 'CREATE POLICY "Auth users can manage sales" ON public.sales FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ── sale_items ──────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Auth users can manage sale items" ON public.sale_items';
        EXECUTE 'CREATE POLICY "Auth users can manage sale items" ON public.sale_items FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ── orders ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Auth users can manage orders" ON public.orders';
        EXECUTE 'CREATE POLICY "Auth users can manage orders" ON public.orders FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ── order_items ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Auth users can manage order items" ON public.order_items';
        EXECUTE 'CREATE POLICY "Auth users can manage order items" ON public.order_items FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ── products ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Auth users can manage products" ON public.products';
        EXECUTE 'CREATE POLICY "Auth users can manage products" ON public.products FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ── payments ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Auth users can manage payments" ON public.payments';
        EXECUTE 'CREATE POLICY "Auth users can manage payments" ON public.payments FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
    END IF;
END $$;

-- ✅ Verificación: Ejecutar esto después para confirmar
-- SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
