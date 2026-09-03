ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS ghl_task_id text,
  ADD COLUMN IF NOT EXISTS ghl_contact_id text,
  ADD COLUMN IF NOT EXISTS ghl_location_id text,
  ADD COLUMN IF NOT EXISTS ghl_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS ghl_sync_error text;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_approval_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_approval_status_check
  CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected'));

UPDATE public.tasks
SET approval_status = 'pending'
WHERE source = 'client_request'
  AND status = 'requested'
  AND deleted_at IS NULL
  AND approval_status = 'not_required';