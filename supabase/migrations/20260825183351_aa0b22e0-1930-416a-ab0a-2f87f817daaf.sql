ALTER TABLE public.task_comments ADD COLUMN edited_at timestamp with time zone;

CREATE TABLE public.task_comment_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  edited_by uuid REFERENCES auth.users(id),
  old_body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.task_comment_edits TO authenticated;
GRANT ALL ON public.task_comment_edits TO service_role;
ALTER TABLE public.task_comment_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment edits readable" ON public.task_comment_edits
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.task_comments c
    WHERE c.id = comment_id AND app_private.can_see_task(c.task_id)
  ));

CREATE POLICY "comment edits insert own" ON public.task_comment_edits
  FOR INSERT TO authenticated
  WITH CHECK (edited_by = auth.uid());

-- Authors can edit their own comments.
CREATE POLICY "comments own update" ON public.task_comment_edits FOR SELECT TO service_role USING (false);
CREATE POLICY "comments own update" ON public.task_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger: snapshot the old body automatically whenever a comment body changes.
CREATE OR REPLACE FUNCTION public.log_comment_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.body IS DISTINCT FROM NEW.body THEN
    INSERT INTO public.task_comment_edits (comment_id, edited_by, old_body)
    VALUES (OLD.id, auth.uid(), OLD.body);
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER task_comments_edit_audit
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_comment_edit();