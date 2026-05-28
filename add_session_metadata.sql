-- ============================================================================
-- Agregar nombre de cliente, número de personas y vinculación de cliente a table_sessions
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS client_id TEXT;  -- ID del cliente registrado (de bodega_customers_v1)
