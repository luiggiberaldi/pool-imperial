-- ============================================================================
-- SQL Migration: Add missing columns and tables to synchronize local database and Supabase
-- Run this in your Supabase Dashboard → SQL Editor to fix 400 Bad Request, Debts & Backups errors.
-- ============================================================================

-- 1. Fix missing table_sessions columns (fixes Open Session, Consumption & Close Session errors!)
ALTER TABLE public.table_sessions 
    ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS opened_by TEXT,
    ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 2. Fix missing staff_debts 'note' column (fixes Debts errors!)
ALTER TABLE public.staff_debts
    ADD COLUMN IF NOT EXISTS note TEXT;

-- 3. Create device_backups table if it doesn't exist (fixes automated local backups error!)
CREATE TABLE IF NOT EXISTS public.device_backups (
    device_id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    backup_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for device_backups if it's new
ALTER TABLE public.device_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a device_backups" ON public.device_backups;
CREATE POLICY "Permitir todo a device_backups"
    ON public.device_backups FOR ALL USING (true) WITH CHECK (true);
