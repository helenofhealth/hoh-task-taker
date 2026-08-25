CREATE TABLE public.task_owners (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.task_owners TO authenticated;
GRANT ALL ON public.task_owners TO service_role;
ALTER TABLE public.task_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners readable" ON public.task_owners FOR SELECT TO authenticated USING (public.can_see_task(task_id));
CREATE POLICY "owners write" ON public.task_owners FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
-- Backfill: copy each task's current primary owner into the join table
INSERT INTO public.task_owners (task_id, user_id)
SELECT id, owner_id FROM public.tasks WHERE owner_id IS NOT NULL
ON CONFLICT DO NOTHING;