create or replace function public.create_welcome_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  insert into public.tasks (
    client_id, title, description, status, priority, project, source, created_by
  ) values (
    NEW.id,
    'Welcome to Helen of Health Task Taker',
    'Welcome aboard, ' || NEW.name || '! This is your starter task — use it to say hello, share any access details (logins, brand assets) and confirm your first priorities. Your dedicated project is "' || coalesce(NEW.default_project, 'Onboarding') || '".',
    'requested',
    'normal',
    coalesce(NEW.default_project, 'Onboarding'),
    'staff',
    auth.uid()
  )
  returning id into v_task_id;

  insert into public.task_activity (task_id, actor_id, kind, detail)
  values (v_task_id, auth.uid(), 'system', 'Welcome task auto-created for new client ' || NEW.name);

  return NEW;
end;
$$;

create trigger clients_welcome_task
after insert on public.clients
for each row execute function public.create_welcome_task();