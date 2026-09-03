CREATE OR REPLACE FUNCTION public.log_task_member_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(full_name, email, 'Someone') INTO v_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.task_id, auth.uid(), TG_ARGV[0], v_name || ' added as ' || TG_ARGV[1]);
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip logging when the parent task is gone (cascading task delete).
    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = OLD.task_id) THEN
      RETURN NULL;
    END IF;
    SELECT COALESCE(full_name, email, 'Someone') INTO v_name FROM public.profiles WHERE id = OLD.user_id;
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (OLD.task_id, auth.uid(), TG_ARGV[0], v_name || ' removed as ' || TG_ARGV[1]);
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$function$;

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

  -- Skip logging when the parent task is gone (cascading task delete).
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = v_row.task_id) THEN
    RETURN NULL;
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

CREATE OR REPLACE FUNCTION public.log_task_comment_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = NEW.task_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
  VALUES (NEW.task_id, auth.uid(), 'comment',
    CASE WHEN NEW.parent_id IS NULL THEN 'Added a comment' ELSE 'Replied to a comment' END
    || ': "' || left(NEW.body, 120) || CASE WHEN length(NEW.body) > 120 THEN '…' ELSE '' END || '"');
  RETURN NULL;
END;
$function$;