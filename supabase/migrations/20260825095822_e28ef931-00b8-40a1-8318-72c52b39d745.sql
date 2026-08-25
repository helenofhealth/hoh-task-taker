CREATE TABLE public.time_entry_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  time_entry_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_user_id uuid,
  action text NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  raw_minutes numeric,
  rounded_minutes integer,
  rounding_delta_minutes numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX time_entry_audit_task_idx ON public.time_entry_audit (task_id, created_at DESC);
CREATE INDEX time_entry_audit_entry_idx ON public.time_entry_audit (time_entry_id, created_at DESC);

GRANT SELECT ON public.time_entry_audit TO authenticated;
GRANT ALL ON public.time_entry_audit TO service_role;

ALTER TABLE public.time_entry_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit readable" ON public.time_entry_audit
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.can_see_task(task_id));

CREATE OR REPLACE FUNCTION public.log_time_entry_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_row public.time_entries;
  v_raw numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := NEW;
    v_action := CASE WHEN NEW.ended_at IS NULL THEN 'started' ELSE 'stopped' END;
  ELSE
    v_row := NEW;
    IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
      v_action := 'stopped';
    ELSE
      v_action := 'adjusted';
    END IF;
  END IF;

  IF v_row.ended_at IS NOT NULL THEN
    v_raw := round(GREATEST(EXTRACT(EPOCH FROM (v_row.ended_at - v_row.started_at)) / 60.0, 0)::numeric, 3);
  ELSE
    v_raw := NULL;
  END IF;

  INSERT INTO public.time_entry_audit (
    time_entry_id, task_id, actor_id, entry_user_id, action,
    started_at, ended_at, raw_minutes, rounded_minutes, rounding_delta_minutes, note
  ) VALUES (
    v_row.id, v_row.task_id, auth.uid(), v_row.user_id, v_action,
    v_row.started_at, v_row.ended_at, v_raw, v_row.minutes,
    CASE WHEN v_raw IS NULL OR v_row.minutes IS NULL THEN NULL ELSE round(v_row.minutes - v_raw, 3) END,
    v_row.note
  );

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_time_entry_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER time_entries_audit
AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.log_time_entry_audit();