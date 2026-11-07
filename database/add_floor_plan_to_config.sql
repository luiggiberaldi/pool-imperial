-- Migración: guardar la distribución del plano del local en la nube (pool_config.floor_plan)
-- Ejecutar en el Editor SQL de Supabase (https://abbrcppmwsmxhoaxkgsh.supabase.co)
-- Sin esta columna el editor de plano sigue funcionando, pero solo guarda en el dispositivo actual.

ALTER TABLE public.pool_config
  ADD COLUMN IF NOT EXISTS floor_plan JSONB;

-- Tiempo real: avisa a los demás dispositivos cuando alguien guarda el plano
-- (pool_config no estaba en la publicación supabase_realtime).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pool_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_config;
  END IF;
END $$;
