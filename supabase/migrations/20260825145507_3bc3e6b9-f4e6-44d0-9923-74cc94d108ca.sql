CREATE OR REPLACE VIEW public.visible_profiles AS
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
  OR (
    app_private.is_staff(p.id)
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      LEFT JOIN public.task_followers tf
        ON tf.task_id = t.id AND tf.user_id = p.id
      WHERE t.client_id = app_private.my_client_id()
        AND (t.owner_id = p.id OR tf.user_id IS NOT NULL)
    )
  );

ALTER VIEW public.visible_profiles SET (security_invoker = true);

REVOKE ALL ON public.visible_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.visible_profiles TO authenticated;
GRANT ALL ON public.visible_profiles TO service_role;