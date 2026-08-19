-- ============================================================================
-- Pool Imperial: metadata durable de transferencias de mesas
-- Ejecutar en Supabase SQL Editor antes de habilitar la lectura de metadata.
-- La aplicación mantiene fallback al esquema legado mientras esta migración no
-- haya sido aplicada.
-- ============================================================================

ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS transfer_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_table_sessions_transfer_operation
    ON public.table_sessions ((transfer_metadata->>'operation_id'));

COMMENT ON COLUMN public.table_sessions.transfer_metadata IS
    'Contexto durable del último traslado de mesa: operación, timestamps y cargo de tiempo congelado.';
