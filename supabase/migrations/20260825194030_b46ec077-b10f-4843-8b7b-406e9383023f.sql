create policy "task files update"
on storage.objects
for update
to authenticated
using (bucket_id = 'task-files' and app_private.can_see_task((nullif(split_part(name, '/', 1), ''))::uuid))
with check (bucket_id = 'task-files' and app_private.can_see_task((nullif(split_part(name, '/', 1), ''))::uuid));