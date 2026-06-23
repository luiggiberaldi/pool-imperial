-- ============================================================================
-- Tabla de clientes del Pool
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pool_customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    phone       TEXT,
    document    TEXT,
    deuda       NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para búsqueda por nombre
CREATE INDEX IF NOT EXISTS pool_customers_name_idx ON public.pool_customers (name);

-- Acceso público (misma política que table_sessions)
ALTER TABLE public.pool_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow all for anon" ON public.pool_customers
    FOR ALL TO anon USING (true) WITH CHECK (true);
