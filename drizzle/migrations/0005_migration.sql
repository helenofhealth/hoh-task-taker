ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_synced_at timestamptz;
UPDATE public.task_attachments SET drive_file_id = substring(file_path from 8)
  WHERE source = 'google_drive' AND file_path LIKE 'gdrive:%' AND drive_file_id IS NULL;
CREATE INDEX IF NOT EXISTS task_attachments_name_idx ON public.task_attachments (lower(file_name));
CREATE INDEX IF NOT EXISTS task_attachments_drive_idx ON public.task_attachments (drive_file_id);