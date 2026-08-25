CREATE POLICY "task files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-files' AND public.can_see_task(NULLIF(split_part(name, '/', 1), '')::uuid));
CREATE POLICY "task files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-files' AND public.can_see_task(NULLIF(split_part(name, '/', 1), '')::uuid));
CREATE POLICY "task files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-files' AND public.can_see_task(NULLIF(split_part(name, '/', 1), '')::uuid));