ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON public.tasks (deleted_at);

CREATE TABLE public.task_bulk_delete_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('deleted', 'restored', 'purged')),
  task_ids uuid[] NOT NULL,
  task_count integer NOT NULL,
  task_titles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.task_bulk_delete_audit TO authenticated;
GRANT ALL ON public.task_bulk_delete_audit TO service_role;

ALTER TABLE public.task_bulk_delete_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read bulk delete audit"
ON public.task_bulk_delete_audit
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can log bulk delete actions"
ON public.task_bulk_delete_audit
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND actor_id = auth.uid());