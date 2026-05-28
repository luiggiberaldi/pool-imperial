-- =================================================================================
-- FIX: Aislamiento de datos por cuenta (user_id)
-- Ejecutar en Supabase Dashboard → SQL Editor
-- Proyecto: Pool Los Diaz
-- =================================================================================

-- 1. Agregar columna user_id a las tablas que la necesitan
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.pool_config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Actualizar registros existentes con el user_id del usuario actual
-- (ejecutar esto SOLO si hay un único usuario; si hay múltiples, ajustar manualmente)
-- UPDATE public.cash_sessions SET user_id = auth.uid() WHERE user_id IS NULL;
-- UPDATE public.table_sessions SET user_id = auth.uid() WHERE user_id IS NULL;
-- UPDATE public.orders SET user_id = auth.uid() WHERE user_id IS NULL;
-- UPDATE public.tables SET user_id = auth.uid() WHERE user_id IS NULL;
-- UPDATE public.pool_config SET user_id = auth.uid() WHERE user_id IS NULL;

-- 3. Reemplazar RLS de cash_sessions
DROP POLICY IF EXISTS "Acceso completo a cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Authenticated users can manage cash sessions" ON public.cash_sessions;

CREATE POLICY "User can manage own cash sessions"
    ON public.cash_sessions FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 4. RLS para table_sessions
DROP POLICY IF EXISTS "Auth users can manage table sessions" ON public.table_sessions;

CREATE POLICY "User can manage own table sessions"
    ON public.table_sessions FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 5. RLS para orders
DROP POLICY IF EXISTS "Auth users can manage orders" ON public.orders;

CREATE POLICY "User can manage own orders"
    ON public.orders FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 6. RLS para tables
-- Nota: las mesas son configuración del negocio, cada cuenta tiene sus propias mesas
DROP POLICY IF EXISTS "Auth users can manage tables" ON public.tables;

CREATE POLICY "User can manage own tables"
    ON public.tables FOR ALL
    USING (user_id = auth.uid() OR user_id IS NULL)
    WITH CHECK (user_id = auth.uid());

-- 7. RLS para pool_config
CREATE POLICY "User can manage own pool config"
    ON public.pool_config FOR ALL
    USING (user_id = auth.uid() OR user_id IS NULL)
    WITH CHECK (user_id = auth.uid());

-- 8. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_status ON public.cash_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_user_status ON public.table_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON public.orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tables_user_active ON public.tables(user_id, active);

-- 9. staff_users: agregar user_id + RLS
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Asignar todos los staff existentes al usuario poollosdiazbar
UPDATE public.staff_users SET user_id = '8cddd864-e673-4343-a14e-d2980b1a1eb0' WHERE user_id IS NULL;

-- Eliminar políticas anteriores y crear nueva por user_id
DROP POLICY IF EXISTS "Permitir todo a staff_users" ON public.staff_users;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.staff_users;
DROP POLICY IF EXISTS "User can manage own staff" ON public.staff_users;

-- Habilitar RLS si no está activo
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can manage own staff"
    ON public.staff_users FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_staff_users_user_active ON public.staff_users(user_id, active);

-- 10. sales: agregar user_id + RLS
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Asignar ventas existentes al usuario poollosdiazbar
UPDATE public.sales SET user_id = '8cddd864-e673-4343-a14e-d2980b1a1eb0' WHERE user_id IS NULL;

DROP POLICY IF EXISTS "Auth users can manage sales" ON public.sales;
DROP POLICY IF EXISTS "User can manage own sales" ON public.sales;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can manage own sales"
    ON public.sales FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_sales_user ON public.sales(user_id);

-- 11. sale_items: aislamiento via sale_id (FK a sales que ya tiene user_id)
-- No necesita user_id propio, RLS se hereda de la relación con sales

-- 12. Actualizar la función process_checkout para incluir user_id
-- NOTA: Esto requiere recrear la función. Verificar la definición actual primero.
-- El RPC debe pasar auth.uid() al INSERT de sales:
--   INSERT INTO sales (..., user_id) VALUES (..., auth.uid());

-- ✅ Verificación final
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
