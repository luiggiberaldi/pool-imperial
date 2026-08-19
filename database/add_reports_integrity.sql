-- Pool Imperial — integridad de reportes y vínculo venta/turno
-- Ejecutar después de pool_imperial_full_schema.sql.
-- Es idempotente y no modifica datos históricos existentes.

-- Algunas instalaciones antiguas crearon cash_sessions sin user_id. Se agrega
-- nullable para poder filtrar reaperturas por cuenta sin romper esos registros.
ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS user_id UUID
        REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_status
    ON public.cash_sessions(user_id, status, opened_at);

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS cash_session_id UUID
        REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_user_cash_session
    ON public.sales(user_id, cash_session_id, timestamp);

COMMENT ON COLUMN public.sales.cash_session_id IS
    'Turno de caja que originó la venta; permite reportes exactos por sesión.';
