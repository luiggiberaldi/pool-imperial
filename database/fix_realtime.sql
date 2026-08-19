-- Pool Imperial — Realtime idempotente para sincronización operativa
-- Se puede ejecutar varias veces sin fallar si la tabla ya está publicada.

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cash_sessions', 'table_sessions', 'tables', 'orders',
        'order_items', 'sales', 'sync_documents'
    ] LOOP
        IF to_regclass('public.' || v_table) IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime'
                 AND schemaname = 'public'
                 AND tablename = v_table
           ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
        END IF;
    END LOOP;
END $$;

SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN (
      'cash_sessions', 'table_sessions', 'tables', 'orders',
      'order_items', 'sales', 'sync_documents'
  )
ORDER BY tablename;
