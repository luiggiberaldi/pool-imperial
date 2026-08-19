-- Pool Imperial — endurecimiento de backups y privilegios RPC
-- Idempotente. Ejecutar después del esquema base y de las migraciones de RLS.
-- No hace backfill ni modifica datos de negocio.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF to_regclass('public.device_backups') IS NULL
       OR to_regclass('public.account_devices') IS NULL THEN
        RAISE EXCEPTION 'DB_HARDENING_BLOCKED: faltan device_backups o account_devices';
    END IF;
    IF to_regprocedure('public.process_checkout(jsonb)') IS NULL
       OR to_regprocedure('public.transfer_table_atomic(text,uuid,uuid,text,jsonb)') IS NULL
       OR to_regprocedure('public.transfer_pool_to_normal_atomic(text,uuid,uuid,text,numeric,jsonb)') IS NULL
       OR to_regprocedure('public.register_and_check_device(text,text,text)') IS NULL THEN
        RAISE EXCEPTION 'DB_HARDENING_BLOCKED: falta una función crítica';
    END IF;
END $$;

ALTER TABLE public.device_backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a device_backups" ON public.device_backups;
DROP POLICY IF EXISTS "Owner can manage own device backups" ON public.device_backups;
CREATE POLICY "Owner can manage own device backups"
    ON public.device_backups
    FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.account_devices d
        WHERE d.device_id = device_backups.device_id
          AND d.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.account_devices d
        WHERE d.device_id = device_backups.device_id
          AND d.user_id = auth.uid()
    ));

REVOKE EXECUTE ON FUNCTION public.process_checkout(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_table_atomic(text,uuid,uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_pool_to_normal_atomic(text,uuid,uuid,text,numeric,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_and_check_device(text,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_checkout(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_table_atomic(text,uuid,uuid,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_pool_to_normal_atomic(text,uuid,uuid,text,numeric,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_and_check_device(text,text,text) TO authenticated, service_role;

COMMIT;
