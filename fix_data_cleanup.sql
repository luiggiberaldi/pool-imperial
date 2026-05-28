-- ============================================================================
-- FIX DATA CLEANUP — Eliminar duplicados y datos fantasma
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── 1. Eliminar venta duplicada offline_sync ────────────────────────────────
-- La venta 3e2e65f0 es duplicado exacto de 66d7602b (mismo total, timestamp, items)
DELETE FROM public.sale_items
WHERE sale_id = '3e2e65f0-43ca-41e4-8084-ab385eb07236';

DELETE FROM public.sales
WHERE id = '3e2e65f0-43ca-41e4-8084-ab385eb07236';

-- ── 2. Cerrar orders fantasma con total $0 ──────────────────────────────────
UPDATE public.orders
SET status = 'CANCELLED',
    closed_at = NOW(),
    closed_by = 'system_cleanup'
WHERE status = 'OPEN'
  AND total_usd = 0
  AND total_bs = 0;

-- ── 3. Limpiar order_items huérfanos (de orders canceladas) ─────────────────
DELETE FROM public.order_items
WHERE order_id IN (
    SELECT id FROM public.orders WHERE status = 'CANCELLED' AND closed_by = 'system_cleanup'
);

-- ✅ Verificación
SELECT 'sales' AS tabla, COUNT(*) AS filas FROM public.sales
UNION ALL
SELECT 'sale_items', COUNT(*) FROM public.sale_items
UNION ALL
SELECT 'orders (OPEN)', COUNT(*) FROM public.orders WHERE status = 'OPEN'
UNION ALL
SELECT 'orders (CANCELLED)', COUNT(*) FROM public.orders WHERE status = 'CANCELLED';
