-- Pool Imperial — endurecimiento RLS para sincronización multi-cuenta
-- Ejecutar DESPUÉS del esquema/base y como último script de políticas.
-- Este archivo reemplaza la lógica permisiva de fix_rls_policies.sql.
-- No hace backfill automático: las filas con user_id NULL quedan bloqueadas hasta
-- asignarlas manualmente a la cuenta correcta.

DO $$
DECLARE
    v_table TEXT;
    v_count BIGINT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'sync_documents', 'sales', 'cash_sessions', 'table_sessions',
        'orders', 'tables', 'pool_config', 'pool_customers', 'staff_users'
    ] LOOP
        IF to_regclass('public.' || v_table) IS NOT NULL THEN
            EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS NULL', v_table)
                INTO v_count;
            RAISE NOTICE 'RLS preflight: %.user_id NULL = %', v_table, v_count;
        END IF;
    END LOOP;
END $$;

-- Activar RLS en las entidades de la cuenta.
ALTER TABLE IF EXISTS public.sync_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pool_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pool_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_debt_payments ENABLE ROW LEVEL SECURITY;

-- ── Eliminar políticas amplias y variantes antiguas ─────────────────────────
DROP POLICY IF EXISTS "Permitir todo a sync_documents" ON public.sync_documents;
DROP POLICY IF EXISTS "Users can manage own sync docs" ON public.sync_documents;
DROP POLICY IF EXISTS "Auth users can manage sync documents" ON public.sync_documents;

DROP POLICY IF EXISTS "Permitir todo a sales" ON public.sales;
DROP POLICY IF EXISTS "Auth users can manage sales" ON public.sales;
DROP POLICY IF EXISTS "User can manage own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can manage own sales" ON public.sales;

DROP POLICY IF EXISTS "Acceso completo a cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Authenticated users can manage cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "User can manage own cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Users can manage own cash sessions" ON public.cash_sessions;

DROP POLICY IF EXISTS "Auth users can manage table sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "User can manage own table sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Users can manage own table sessions" ON public.table_sessions;

DROP POLICY IF EXISTS "Auth users can manage orders" ON public.orders;
DROP POLICY IF EXISTS "User can manage own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can manage own orders" ON public.orders;

DROP POLICY IF EXISTS "Auth users can manage tables" ON public.tables;
DROP POLICY IF EXISTS "User can manage own tables" ON public.tables;
DROP POLICY IF EXISTS "Users can manage own tables" ON public.tables;

DROP POLICY IF EXISTS "User can manage own pool config" ON public.pool_config;
DROP POLICY IF EXISTS "Users can manage own pool config" ON public.pool_config;

DROP POLICY IF EXISTS "Auth users can manage order items" ON public.order_items;
DROP POLICY IF EXISTS "User can manage own order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can manage own order items" ON public.order_items;

DROP POLICY IF EXISTS "Auth users can manage sale items" ON public.sale_items;
DROP POLICY IF EXISTS "User can manage own sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Users can manage own sale items" ON public.sale_items;

DROP POLICY IF EXISTS "Users can manage own customers" ON public.pool_customers;
DROP POLICY IF EXISTS "User can manage own customers" ON public.pool_customers;
DROP POLICY IF EXISTS "Users can manage own staff" ON public.staff_users;
DROP POLICY IF EXISTS "User can manage own staff" ON public.staff_users;
DROP POLICY IF EXISTS "Users can manage own debts" ON public.staff_debts;
DROP POLICY IF EXISTS "Users can manage own debt payments" ON public.staff_debt_payments;

-- ── Políticas estrictas por cuenta ──────────────────────────────────────────
CREATE POLICY "sync_owner_documents"
    ON public.sync_documents FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_sales"
    ON public.sales FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_cash_sessions"
    ON public.cash_sessions FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_table_sessions"
    ON public.table_sessions FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_orders"
    ON public.orders FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_tables"
    ON public.tables FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_pool_config"
    ON public.pool_config FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_customers"
    ON public.pool_customers FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_staff"
    ON public.staff_users FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_staff_debts"
    ON public.staff_debts FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "sync_owner_staff_debt_payments"
    ON public.staff_debt_payments FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Los items no tienen user_id propio: el dueño se hereda del padre.
CREATE POLICY "sync_owner_order_items"
    ON public.order_items FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.orders parent
        WHERE parent.id = order_items.order_id
          AND parent.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.orders parent
        WHERE parent.id = order_items.order_id
          AND parent.user_id = auth.uid()
    ));

CREATE POLICY "sync_owner_sale_items"
    ON public.sale_items FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.sales parent
        WHERE parent.id = sale_items.sale_id
          AND parent.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.sales parent
        WHERE parent.id = sale_items.sale_id
          AND parent.user_id = auth.uid()
    ));

-- Índices usados por RLS y por los pulls incrementales.
CREATE INDEX IF NOT EXISTS idx_sync_documents_owner_cursor
    ON public.sync_documents(user_id, collection, updated_at, doc_id);
CREATE INDEX IF NOT EXISTS idx_sales_owner_idempotency
    ON public.sales(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_owner_timestamp
    ON public.sales(user_id, timestamp, id);
CREATE INDEX IF NOT EXISTS idx_orders_owner_status
    ON public.orders(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order
    ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale
    ON public.sale_items(sale_id);

-- Verificación posterior sugerida:
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
