-- Agregar columnas para porcentajes de impuestos personalizables
ALTER TABLE public.pool_config
  ADD COLUMN IF NOT EXISTS tax_rate_iva NUMERIC DEFAULT 19,
  ADD COLUMN IF NOT EXISTS tax_rate_impoconsumo NUMERIC DEFAULT 8;
