CREATE OR REPLACE FUNCTION public.round_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE raw_minutes numeric;
BEGIN
  IF NEW.ended_at IS NULL THEN
    -- A running entry has no billable time yet; ignore any client-supplied value.
    NEW.minutes := NULL;
  ELSE
    IF NEW.ended_at < NEW.started_at THEN
      RAISE EXCEPTION 'ended_at cannot be before started_at';
    END IF;
    raw_minutes := GREATEST(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0, 0);
    NEW.minutes := GREATEST(CEIL(raw_minutes / 15.0) * 15, 15);
  END IF;
  RETURN NEW;
END; $function$;