ALTER TABLE public.task_comments ADD COLUMN parent_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE;

CREATE INDEX task_comments_parent_id_idx ON public.task_comments(parent_id);

ALTER TABLE public.task_comment_edits ADD COLUMN parent_id uuid;

CREATE OR REPLACE FUNCTION public.log_comment_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.body IS DISTINCT FROM NEW.body THEN
    INSERT INTO public.task_comment_edits (comment_id, edited_by, old_body, parent_id)
    VALUES (OLD.id, auth.uid(), OLD.body, OLD.parent_id);
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$function$;