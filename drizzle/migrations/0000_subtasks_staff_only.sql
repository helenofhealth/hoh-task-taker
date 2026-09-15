-- Only admins and staff members may add, delete or edit subtasks.
-- Clients can still view the subtask list but cannot change it.
create or replace function public.guard_client_task_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff(auth.uid()) then
    return NEW;
  end if;

  NEW.client_id := OLD.client_id;
  NEW.status := OLD.status;
  NEW.source := OLD.source;
  NEW.owner_id := OLD.owner_id;
  NEW.approval_status := OLD.approval_status;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.estimated_hours := OLD.estimated_hours;
  NEW.proven_task_id := OLD.proven_task_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.position := OLD.position;
  NEW.deleted_at := OLD.deleted_at;
  NEW.deleted_by := OLD.deleted_by;
  NEW.qc_checklist := OLD.qc_checklist;
  NEW.subtasks := OLD.subtasks;
  NEW.subtasks_done := OLD.subtasks_done;
  NEW.ghl_task_id := OLD.ghl_task_id;
  NEW.ghl_contact_id := OLD.ghl_contact_id;
  NEW.ghl_location_id := OLD.ghl_location_id;
  NEW.ghl_synced_at := OLD.ghl_synced_at;
  NEW.ghl_sync_error := OLD.ghl_sync_error;

  return NEW;
end;
$$;
