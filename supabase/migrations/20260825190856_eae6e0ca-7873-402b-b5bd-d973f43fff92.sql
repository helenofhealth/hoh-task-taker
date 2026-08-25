-- Per-user opt-in to a daily digest instead of instant comment/status emails
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_digest boolean NOT NULL DEFAULT false;

-- Private config table holding the token the cron job uses to call the digest endpoint.
-- No GRANTs: only service_role (and cron, running as postgres) can read it.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.config (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO app_private.config (key, value)
VALUES ('digest_cron_token', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- Scheduled digest: 06:00 UTC = 09:00 Athens, Monday-Friday
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-digest') THEN
    PERFORM cron.unschedule('daily-digest');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-digest',
  '0 6 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://tasks.helenofhealth.com/api/public/digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT value FROM app_private.config WHERE key = 'digest_cron_token')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);