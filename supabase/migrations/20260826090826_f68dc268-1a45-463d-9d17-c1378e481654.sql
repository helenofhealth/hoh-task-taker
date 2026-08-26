ALTER TABLE public.hour_credits ADD COLUMN IF NOT EXISTS expires_at date;

CREATE OR REPLACE FUNCTION public.set_hour_credit_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    IF NEW.kind = 'retainer' THEN
      NEW.expires_at := (date_trunc('month', COALESCE(NEW.effective_month, (NEW.created_at)::date, CURRENT_DATE)::timestamp)
                         + interval '1 month' - interval '1 day')::date;
    ELSE
      NEW.expires_at := (COALESCE(NEW.effective_month, (NEW.created_at)::date, CURRENT_DATE) + interval '3 months')::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hour_credits_expiry ON public.hour_credits;
CREATE TRIGGER hour_credits_expiry
BEFORE INSERT OR UPDATE ON public.hour_credits
FOR EACH ROW EXECUTE FUNCTION public.set_hour_credit_expiry();

UPDATE public.hour_credits
SET expires_at = CASE
  WHEN kind = 'retainer'
    THEN (date_trunc('month', COALESCE(effective_month, created_at::date)::timestamp) + interval '1 month' - interval '1 day')::date
  ELSE (COALESCE(effective_month, created_at::date) + interval '3 months')::date
END
WHERE expires_at IS NULL;

CREATE TABLE IF NOT EXISTS public.client_hour_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  remaining_hours numeric,
  bought_hours numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, period_key)
);

GRANT SELECT, INSERT ON public.client_hour_alerts TO authenticated;
GRANT ALL ON public.client_hour_alerts TO service_role;

ALTER TABLE public.client_hour_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client hour alerts readable"
ON public.client_hour_alerts FOR SELECT TO authenticated
USING (app_private.is_staff(auth.uid()) OR client_id = app_private.my_client_id());

CREATE POLICY "staff record hour alerts"
ON public.client_hour_alerts FOR INSERT TO authenticated
WITH CHECK (app_private.is_staff(auth.uid()));