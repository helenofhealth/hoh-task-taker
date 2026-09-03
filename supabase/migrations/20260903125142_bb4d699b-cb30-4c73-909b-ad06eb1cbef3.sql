alter table public.proven_tasks add column if not exists client_id uuid references public.clients(id) on delete cascade;
create index if not exists proven_tasks_client_id_idx on public.proven_tasks(client_id);

drop policy if exists "Anyone signed in can read active proven tasks" on public.proven_tasks;
create policy "Read shared or own agency proven tasks" on public.proven_tasks
for select to authenticated
using (status = 'active' and (client_id is null or public.is_staff(auth.uid()) or client_id = public.my_client_id()));

drop policy if exists "Clients can suggest draft proven tasks" on public.proven_tasks;
create policy "Clients can suggest draft proven tasks" on public.proven_tasks
for insert to authenticated
with check (status = 'draft' and is_system = false and created_by = auth.uid()
  and (client_id is null or public.is_staff(auth.uid()) or client_id = public.my_client_id()));