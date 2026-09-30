DROP POLICY IF EXISTS "Everyone signed in can read categories" ON public.task_categories;

CREATE POLICY "Staff can read categories"
ON public.task_categories
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));