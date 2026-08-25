DROP VIEW IF EXISTS public.visible_profiles;

CREATE VIEW public.visible_profiles AS
SELECT
  p.id,
  p.full_name,
  CASE
    WHEN p.id = auth.uid() OR app_private.is_staff(auth.uid()) THEN p.email
    ELSE NULL::text
  END AS email,
  p.avatar_url,
  CASE
    WHEN p.id = auth.uid() OR app_private.is_staff(auth.uid()) THEN p.client_id
    ELSE NULL::uuid
  END AS client_id,
  p.created_at
FROM public.profiles p
WHERE
  p.id = auth.uid()
  OR app_private.is_staff(auth.uid())
  OR app_private.is_staff(p.id);

REVOKE ALL ON public.visible_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.visible_profiles TO authenticated;
GRANT ALL ON public.visible_profiles TO service_role;

DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "profiles readable" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR app_private.is_staff(auth.uid()));