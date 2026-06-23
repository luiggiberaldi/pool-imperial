-- ============================================================================
-- FIX CONSTRAINTS — Agregar validaciones a nivel de base de datos
-- Ejecutar en Supabase Dashboard → SQL Editor (DESPUÉS de fix_cash_sessions_schema.sql)
-- ============================================================================

-- ── cash_sessions ───────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_base_usd_positive') THEN
        ALTER TABLE public.cash_sessions ADD CONSTRAINT chk_base_usd_positive CHECK (base_usd >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_base_bs_positive') THEN
        ALTER TABLE public.cash_sessions ADD CONSTRAINT chk_base_bs_positive CHECK (base_bs >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_closed_after_opened') THEN
        ALTER TABLE public.cash_sessions ADD CONSTRAINT chk_closed_after_opened
            CHECK (closed_at IS NULL OR closed_at >= opened_at);
    END IF;
END $$;

-- ── sales ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_total_positive') THEN
        ALTER TABLE public.sales ADD CONSTRAINT chk_sale_total_positive CHECK (total >= 0);
    END IF;
END $$;

-- ── sale_items ──────────────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_item_qty_positive') THEN
        ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_item_qty_positive CHECK (quantity > 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_item_price_positive') THEN
        ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_item_price_positive CHECK (unit_price >= 0);
    END IF;
END $$;
