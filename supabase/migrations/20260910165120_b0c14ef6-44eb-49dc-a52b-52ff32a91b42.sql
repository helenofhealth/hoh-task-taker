DROP POLICY IF EXISTS "time own update" ON public.time_entries;
CREATE POLICY "time own update" ON public.time_entries
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));