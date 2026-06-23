-- Migración para sistema de asientos por persona en mesas
-- Ejecutar en Supabase Dashboard → SQL Editor

-- 1. Agregar columna seats (JSONB) a table_sessions
ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS seats JSONB DEFAULT '[]';

-- 2. Agregar columna seat_id a order_items
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS seat_id TEXT;
