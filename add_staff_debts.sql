-- ============================================================
-- Staff Debts System
-- ============================================================

-- Tabla principal de deudas
CREATE TABLE IF NOT EXISTS staff_debts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id    uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    concept     text NOT NULL,
    amount_usd  numeric NOT NULL CHECK (amount_usd > 0),
    remaining_usd numeric NOT NULL CHECK (remaining_usd >= 0),
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_staff_debts_staff ON staff_debts(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_debts_user  ON staff_debts(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_debts_status ON staff_debts(status);

-- RLS
ALTER TABLE staff_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_debts_user_policy" ON staff_debts
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Tabla de abonos/pagos
CREATE TABLE IF NOT EXISTS staff_debt_payments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id     uuid NOT NULL REFERENCES staff_debts(id) ON DELETE CASCADE,
    amount_usd  numeric NOT NULL CHECK (amount_usd > 0),
    note        text DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON staff_debt_payments(debt_id);

-- RLS (via join con staff_debts)
ALTER TABLE staff_debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debt_payments_user_policy" ON staff_debt_payments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM staff_debts WHERE staff_debts.id = debt_id AND staff_debts.user_id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM staff_debts WHERE staff_debts.id = debt_id AND staff_debts.user_id = auth.uid())
    );
