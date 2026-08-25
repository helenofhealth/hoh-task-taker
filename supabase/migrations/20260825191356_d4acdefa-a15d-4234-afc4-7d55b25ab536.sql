ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_start time,
  ADD COLUMN IF NOT EXISTS quiet_end time,
  ADD COLUMN IF NOT EXISTS quiet_timezone text NOT NULL DEFAULT 'Europe/Athens';