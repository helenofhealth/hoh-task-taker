ALTER TABLE public.time_entries
  ADD COLUMN billable boolean NOT NULL DEFAULT true;

ALTER TABLE public.time_entry_audit
  ADD COLUMN billable boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.log_time_entry_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    started_at, ended_at, raw_minutes, rounded_minutes, rounding_delta_minutes, note,
    limit_override, override_minutes, billable
  ) VALUES (
    v_row.id, v_row.task_id, auth.uid(), v_row.user_id, v_action,
    v_row.started_at, v_row.ended_at, v_raw, v_row.minutes,
    CASE WHEN v_raw IS NULL OR v_row.minutes IS NULL THEN NULL ELSE round(v_row.minutes - v_raw, 3) END,
    v_row.note,
    COALESCE(v_row.limit_override, false),
    v_row.override_minutes,
    COALESCE(v_row.billable, true)
  );

  RETURN NULL;
END;
$function$;