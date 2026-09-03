CREATE TABLE public.hour_credit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL,
  client_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('added','edited','removed')),
  hours numeric,
  previous_hours numeric,
  kind text,
  previous_kind text,
  billable boolean,
  previous_billable boolean,
  effective_month date,
  expires_at date,
  previous_expires_at date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hour_credit_audit TO authenticated;
GRANT ALL ON public.hour_credit_audit TO service_role;

ALTER TABLE public.hour_credit_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read hour credit history"
ON public.hour_credit_audit FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE INDEX hour_credit_audit_client_idx ON public.hour_credit_audit (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_hour_credit_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.hour_credit_audit (
      credit_id, client_id, actor_id, action, hours, kind, billable, effective_month, expires_at, note
    ) VALUES (
      NEW.id, NEW.client_id, auth.uid(), 'added', NEW.hours, NEW.kind, NEW.billable,
      NEW.effective_month, NEW.expires_at, NEW.note
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.hour_credit_audit (
      credit_id, client_id, actor_id, action, hours, previous_hours, kind, previous_kind,
      billable, previous_billable, effective_month, expires_at, previous_expires_at, note
    ) VALUES (
      NEW.id, NEW.client_id, auth.uid(), 'edited', NEW.hours, OLD.hours, NEW.kind, OLD.kind,
      NEW.billable, OLD.billable, NEW.effective_month, NEW.expires_at, OLD.expires_at, NEW.note
    );
    RETURN NEW;
  ELSE
    INSERT INTO public.hour_credit_audit (
      credit_id, client_id, actor_id, action, previous_hours, previous_kind, previous_billable,
      effective_month, previous_expires_at, note
    ) VALUES (
      OLD.id, OLD.client_id, auth.uid(), 'removed', OLD.hours, OLD.kind, OLD.billable,
      OLD.effective_month, OLD.expires_at, OLD.note
    );
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER log_hour_credit_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.hour_credits
FOR EACH ROW EXECUTE FUNCTION public.log_hour_credit_audit();