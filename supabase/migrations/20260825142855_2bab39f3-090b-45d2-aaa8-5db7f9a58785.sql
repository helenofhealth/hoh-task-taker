DROP POLICY IF EXISTS "profiles readable" ON public.profiles;

CREATE POLICY "profiles readable" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated 
  USING (
    id = auth.uid() 
    OR is_staff(auth.uid()) 
    OR is_staff(id)
  );