CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_title text NOT NULL,
  category text NOT NULL,
  heading text NOT NULL,
  line text NOT NULL,
  link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX email_outbox_created_idx ON public.email_outbox (created_at);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-flush') THEN
    PERFORM cron.unschedule('email-flush');
  END IF;
END $$;

SELECT cron.schedule(
  'email-flush',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tasks.helenofhealth.com/api/public/email-flush',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT value FROM app_private.config WHERE key = 'digest_cron_token')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);