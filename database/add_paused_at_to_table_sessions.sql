-- ============================================================================
-- Pausa durable de mesas: columna paused_at en table_sessions
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================
--
-- Antes, la pausa de una mesa vivía solo en memoria del cliente + un broadcast
-- realtime fire-and-forget. Si el broadcast se perdía, otros dispositivos (plano,
-- caja) seguían contando el tiempo, y una recarga borraba la pausa. Con paused_at
-- la pausa se persiste en la sesión y se sincroniza como cualquier otro dato:
--   - paused_at NULL  → mesa corriendo normal.
--   - paused_at seteado → tiempo congelado en (paused_at - started_at).
-- Al reanudar se limpia (paused_at = NULL) y se recalcula started_at.

ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;  -- momento en que se pausó la mesa (NULL = activa)
