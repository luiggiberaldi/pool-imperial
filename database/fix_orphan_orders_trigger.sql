-- ============================================================
-- CAPA 3: Trigger DB — Auto-cerrar órdenes huérfanas
-- NOTA: orders.status CHECK permite solo: OPEN, PAID, CANCELLED
-- ============================================================

-- Limpiar las órdenes huérfanas actuales
UPDATE orders
SET status = 'CANCELLED'
WHERE status = 'OPEN'
  AND NOT EXISTS (
    SELECT 1 FROM table_sessions ts
    WHERE ts.id = orders.table_session_id
      AND ts.status IN ('ACTIVE', 'CHECKOUT')
  );

-- Función trigger
CREATE OR REPLACE FUNCTION auto_close_orphan_orders()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'CLOSED' AND (OLD.status = 'ACTIVE' OR OLD.status = 'CHECKOUT') THEN
        UPDATE orders
        SET status = 'CANCELLED'
        WHERE table_session_id = NEW.id
          AND status = 'OPEN';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_close_orphan_orders ON table_sessions;

CREATE TRIGGER trg_auto_close_orphan_orders
    AFTER UPDATE OF status ON table_sessions
    FOR EACH ROW
    WHEN (NEW.status = 'CLOSED')
    EXECUTE FUNCTION auto_close_orphan_orders();
