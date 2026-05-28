-- =================================================================================
-- SETUP: TABLA cash_sessions + RLS + REALTIME
-- Ejecutar en SQL Editor de Supabase (proyecto: raxcxddreghynthyvllh - Pool Los Diaz)
-- =================================================================================

-- 1. Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opened_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    opened_by   TEXT,
    base_usd    NUMERIC(12, 2) DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    closed_at   TIMESTAMP WITH TIME ZONE,
    closed_by   TEXT
);

-- 2. Habilitar RLS
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Política permisiva: cualquier usuario autenticado puede leer/escribir
--    (ya que todos los dispositivos usan la misma cuenta de Supabase Auth)
DROP POLICY IF EXISTS "Acceso completo a cash_sessions" ON public.cash_sessions;
CREATE POLICY "Acceso completo a cash_sessions"
    ON public.cash_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Habilitar Realtime para esta tabla
--    (Ya está habilitado, comentado para evitar error 42710)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_sessions;

-- 5. Verificar que quedó correcto
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'cash_sessions';
