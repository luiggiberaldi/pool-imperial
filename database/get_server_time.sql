-- RPC para obtener el tiempo exacto del servidor Supabase (Postgres)
-- Esto permite sincronizar la hora entre distintos dispositivos y evitar discrepancias en los timers de mesas.

CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz
LANGUAGE sql STABLE
AS $$
  SELECT now();
$$;
