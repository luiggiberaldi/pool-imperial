-- ============================================================================
-- FIX CASH SESSIONS SCHEMA — Agregar columna base_bs y migrar datos
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── 1. Agregar columna base_bs ──────────────────────────────────────────────
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS base_bs NUMERIC DEFAULT 0;

-- ── 2. Migrar datos existentes desde el campo notes (JSON hack) ─────────────
UPDATE public.cash_sessions
SET base_bs = COALESCE((notes::jsonb->>'base_bs')::numeric, 0)
WHERE notes IS NOT NULL
  AND notes != ''
  AND (notes::jsonb->>'base_bs') IS NOT NULL;

-- ── 3. Agregar columna updated_at para auditoría ────────────────────────────
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
