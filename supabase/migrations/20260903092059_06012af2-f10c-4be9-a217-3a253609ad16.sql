ALTER TABLE public.tasks ADD COLUMN project text;

CREATE INDEX IF NOT EXISTS tasks_project_idx ON public.tasks (project);