-- Pool Imperial — Realtime para ventas
-- Migración idempotente: ejecutar después del esquema.

DO $$
BEGIN
    IF to_regclass('public.sales') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = 'sales'
       ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sales';
    END IF;
END $$;

SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('sales', 'sale_items', 'sync_documents')
ORDER BY tablename;
