CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS app_private.cron_tokens (name text PRIMARY KEY, token text NOT NULL);
INSERT INTO app_private.cron_tokens(name, token)
VALUES ('drive_sync', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_token(_name text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_private, public AS $$
  SELECT exists(SELECT 1 FROM app_private.cron_tokens WHERE name = _name AND token = _token)
$$;
REVOKE ALL ON FUNCTION public.verify_cron_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text, text) TO service_role;

SELECT cron.unschedule('daily-drive-sync') WHERE exists (SELECT 1 FROM cron.job WHERE jobname = 'daily-drive-sync');
SELECT cron.schedule('daily-drive-sync', '17 3 * * *', $$
  SELECT net.http_post(
    url := 'https://project--a3f8db8e-0cff-467f-99bc-f3ed03812e63.lovable.app/api/public/cron/drive-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT token FROM app_private.cron_tokens WHERE name = 'drive_sync')),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$);