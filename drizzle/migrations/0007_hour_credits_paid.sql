ALTER TABLE public.hour_credits ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT true;
ALTER TABLE public.hour_credits ADD COLUMN IF NOT EXISTS paid_at timestamptz;