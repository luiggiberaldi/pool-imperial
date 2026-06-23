-- Migración: Agregar columnas de impuesto a la tabla de configuración de mesa
-- Ejecutar en el Editor SQL de Supabase

ALTER TABLE public.pool_config 
  ADD COLUMN IF NOT EXISTS table_tax_type VARCHAR DEFAULT 'exento',
  ADD COLUMN IF NOT EXISTS table_tax_mode VARCHAR DEFAULT 'inclusive';
