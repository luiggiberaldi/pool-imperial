-- ============================================================
-- FIX: Órdenes OPEN huérfanas que nunca se cerraron
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. VER cuántas órdenes OPEN huérfanas existen (sin sesión activa)
SELECT COUNT(*) AS ordenes_huerfanas
FROM orders o
WHERE o.status = 'OPEN'
  AND NOT EXISTS (
    SELECT 1 FROM table_sessions ts
    WHERE ts.id = o.table_session_id
      AND ts.status IN ('ACTIVE', 'CHECKOUT')
  );

-- 2. CERRAR las órdenes OPEN que no tienen sesión activa asociada
UPDATE orders
SET status = 'CLOSED'
WHERE status = 'OPEN'
  AND NOT EXISTS (
    SELECT 1 FROM table_sessions ts
    WHERE ts.id = orders.table_session_id
      AND ts.status IN ('ACTIVE', 'CHECKOUT')
  );

-- Resultado esperado: todas las órdenes fantasma quedan en CLOSED
-- Solo quedan OPEN las órdenes de mesas que están actualmente abiertas
