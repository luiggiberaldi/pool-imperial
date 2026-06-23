-- ============================================================================
-- 🎱 POOL IMPERIAL — HABILITAR REALTIME EN TABLA sales
-- Ejecutar este script en el SQL Editor de tu proyecto Supabase:
-- https://abbrcppmwsmxhoaxkgsh.supabase.co
--
-- IMPORTANTE: Sin ejecutar esto, los cambios de status (ANULADA) en la tabla
-- 'sales' NO se propagan a otros dispositivos en tiempo real.
-- ============================================================================

-- 1. Agregar la tabla 'sales' a la publicación de Supabase Realtime
--    (solo necesita ejecutarse UNA vez)
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;

-- 2. Verificar que quedó registrada
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename IN ('sales', 'sale_items', 'sync_documents');
