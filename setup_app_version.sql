-- Tabla pública para configuraciones globales de la app (no amarrada a un usuario específico)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Permitir lectura pública a cualquier dispositivo
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read app settings" ON public.app_settings;
CREATE POLICY "Public can read app settings" ON public.app_settings
    FOR SELECT
    USING (true);

-- Insertar la versión mínima requerida actual (Versión 1)
INSERT INTO public.app_settings (key, value) 
VALUES ('min_app_version', '1') 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
