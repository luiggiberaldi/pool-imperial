-- Migración: Agregar columnas de propina y servicio a la tabla de configuración de mesa (pool_config)
-- Ejecutar en el Editor SQL de Supabase (https://abbrcppmwsmxhoaxkgsh.supabase.co)

ALTER TABLE public.pool_config 
  ADD COLUMN IF NOT EXISTS default_service_charge_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_service_charge_percent NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS default_tip_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_tip_percent NUMERIC DEFAULT 8;
