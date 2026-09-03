-- 1. Stop non-admins from moving their profile to another client account
create or replace function public.guard_profile_client_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.client_id is distinct from OLD.client_id
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Only admins can change which client a profile belongs to';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_guard_client_id on public.profiles;
create trigger profiles_guard_client_id
before update on public.profiles
for each row execute function public.guard_profile_client_id();

-- 2. Comment edit history can only be written for comments you authored (or by staff)
drop policy if exists "comment edits insert own" on public.task_comment_edits;
create policy "comment edits insert own"
on public.task_comment_edits
for insert
to authenticated
with check (
  edited_by = auth.uid()
  and exists (
    select 1
    from public.task_comments c
    where c.id = task_comment_edits.comment_id
      and public.can_see_task(c.task_id)
      and (c.user_id = auth.uid() or public.is_staff(auth.uid()))
  )
);

-- 3. Clients editing their own open requests cannot touch staff-controlled fields
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
  NEW.subtasks_done := OLD.subtasks_done;
  NEW.ghl_task_id := OLD.ghl_task_id;
  NEW.ghl_contact_id := OLD.ghl_contact_id;
  NEW.ghl_location_id := OLD.ghl_location_id;
  NEW.ghl_synced_at := OLD.ghl_synced_at;
  NEW.ghl_sync_error := OLD.ghl_sync_error;

  return NEW;
end;
$$;

drop trigger if exists tasks_guard_client_columns on public.tasks;
create trigger tasks_guard_client_columns
before update on public.tasks
for each row execute function public.guard_client_task_columns();