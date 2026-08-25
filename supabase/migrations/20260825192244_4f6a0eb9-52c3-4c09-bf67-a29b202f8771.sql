CREATE TABLE public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.task_activity TO authenticated;
GRANT ALL ON public.task_activity TO service_role;
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity readable" ON public.task_activity FOR SELECT TO authenticated
  USING (app_private.can_see_task(task_id));
CREATE INDEX task_activity_task_idx ON public.task_activity (task_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_task_update_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, auth.uid(), 'status', 'Status changed from ' || OLD.status::text || ' to ' || NEW.status::text);
  END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, auth.uid(), 'edit', 'Title changed from "' || OLD.title || '" to "' || NEW.title || '"');
  END IF;
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, auth.uid(), 'edit', 'Due date changed from ' || COALESCE(OLD.due_date::text, 'none') || ' to ' || COALESCE(NEW.due_date::text, 'none'));
  END IF;
  IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, auth.uid(), 'edit', 'Start date changed from ' || COALESCE(OLD.start_date::text, 'none') || ' to ' || COALESCE(NEW.start_date::text, 'none'));
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, auth.uid(), 'edit', 'Priority changed from ' || OLD.priority::text || ' to ' || NEW.priority::text);
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, auth.uid(), 'edit', 'Description updated');
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER tasks_activity_update
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_update_activity();

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
    SELECT COALESCE(full_name, email, 'Someone') INTO v_name FROM public.profiles WHERE id = OLD.user_id;
    INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
    VALUES (OLD.task_id, auth.uid(), TG_ARGV[0], v_name || ' removed as ' || TG_ARGV[1]);
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER task_owners_activity
AFTER INSERT OR DELETE ON public.task_owners
FOR EACH ROW EXECUTE FUNCTION public.log_task_member_activity('assignment', 'owner');

CREATE TRIGGER task_followers_activity
AFTER INSERT OR DELETE ON public.task_followers
FOR EACH ROW EXECUTE FUNCTION public.log_task_member_activity('follower', 'follower');

CREATE OR REPLACE FUNCTION public.log_task_comment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
  VALUES (NEW.task_id, auth.uid(), 'comment',
    CASE WHEN NEW.parent_id IS NULL THEN 'Added a comment' ELSE 'Replied to a comment' END
    || ': "' || left(NEW.body, 120) || CASE WHEN length(NEW.body) > 120 THEN '…' ELSE '' END || '"');
  RETURN NULL;
END;
$function$;

CREATE TRIGGER task_comments_activity
AFTER INSERT ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.log_task_comment_activity();

CREATE OR REPLACE FUNCTION public.log_task_attachment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.task_activity (task_id, actor_id, kind, detail)
  VALUES (NEW.task_id, auth.uid(), 'file', 'Uploaded file "' || NEW.file_name || '"');
  RETURN NULL;
END;
$function$;

CREATE TRIGGER task_attachments_activity
AFTER INSERT ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.log_task_attachment_activity();