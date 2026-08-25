CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'member')
  )
$$;

CREATE OR REPLACE FUNCTION app_private.my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT client_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_private.can_see_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND (app_private.is_staff(auth.uid()) OR t.client_id = app_private.my_client_id())
  )
$$;

REVOKE EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.my_client_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.can_see_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.my_client_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_see_task(uuid) TO authenticated, service_role;

-- Keep public helper functions non-elevated for existing app RPC calls, but stop using them in access rules.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'member')
  )
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT client_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_see_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND (public.is_staff(auth.uid()) OR t.client_id = public.my_client_id())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_client_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_see_task(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_client_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_see_task(uuid) TO service_role;

DROP POLICY IF EXISTS "clients readable" ON public.clients;
DROP POLICY IF EXISTS "clients admin write" ON public.clients;
CREATE POLICY "clients readable" ON public.clients
FOR SELECT TO authenticated
USING (app_private.is_staff(auth.uid()) OR id = app_private.my_client_id());
CREATE POLICY "clients admin write" ON public.clients
FOR ALL TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "credits readable" ON public.hour_credits;
DROP POLICY IF EXISTS "credits admin write" ON public.hour_credits;
CREATE POLICY "credits readable" ON public.hour_credits
FOR SELECT TO authenticated
USING (app_private.is_staff(auth.uid()) OR client_id = app_private.my_client_id());
CREATE POLICY "credits admin write" ON public.hour_credits
FOR ALL TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles readable" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR app_private.is_staff(auth.uid()) OR app_private.is_staff(id));
CREATE POLICY "profiles self update" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (id = auth.uid() OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "roles readable" ON public.user_roles;
DROP POLICY IF EXISTS "roles admin write" ON public.user_roles;
CREATE POLICY "roles readable" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR app_private.is_staff(auth.uid()));
CREATE POLICY "roles admin write" ON public.user_roles
FOR ALL TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "tasks readable" ON public.tasks;
DROP POLICY IF EXISTS "tasks insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks update" ON public.tasks;
DROP POLICY IF EXISTS "tasks delete" ON public.tasks;
CREATE POLICY "tasks readable" ON public.tasks
FOR SELECT TO authenticated
USING (app_private.is_staff(auth.uid()) OR client_id = app_private.my_client_id());
CREATE POLICY "tasks insert" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (app_private.is_staff(auth.uid()) OR client_id = app_private.my_client_id());
CREATE POLICY "tasks update" ON public.tasks
FOR UPDATE TO authenticated
USING (app_private.is_staff(auth.uid()))
WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "tasks delete" ON public.tasks
FOR DELETE TO authenticated
USING (app_private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "followers readable" ON public.task_followers;
DROP POLICY IF EXISTS "followers write" ON public.task_followers;
CREATE POLICY "followers readable" ON public.task_followers
FOR SELECT TO authenticated
USING (app_private.can_see_task(task_id));
CREATE POLICY "followers write" ON public.task_followers
FOR ALL TO authenticated
USING (app_private.is_staff(auth.uid()))
WITH CHECK (app_private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "comments readable" ON public.task_comments;
DROP POLICY IF EXISTS "comments insert" ON public.task_comments;
DROP POLICY IF EXISTS "comments own delete" ON public.task_comments;
CREATE POLICY "comments readable" ON public.task_comments
FOR SELECT TO authenticated
USING (app_private.can_see_task(task_id));
CREATE POLICY "comments insert" ON public.task_comments
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND app_private.can_see_task(task_id));
CREATE POLICY "comments own delete" ON public.task_comments
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "attachments readable" ON public.task_attachments;
DROP POLICY IF EXISTS "attachments insert" ON public.task_attachments;
DROP POLICY IF EXISTS "attachments delete" ON public.task_attachments;
CREATE POLICY "attachments readable" ON public.task_attachments
FOR SELECT TO authenticated
USING (app_private.can_see_task(task_id));
CREATE POLICY "attachments insert" ON public.task_attachments
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND app_private.can_see_task(task_id));
CREATE POLICY "attachments delete" ON public.task_attachments
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR app_private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "time readable" ON public.time_entries;
DROP POLICY IF EXISTS "time own write" ON public.time_entries;
DROP POLICY IF EXISTS "time own update" ON public.time_entries;
DROP POLICY IF EXISTS "time own delete" ON public.time_entries;
CREATE POLICY "time readable" ON public.time_entries
FOR SELECT TO authenticated
USING (app_private.is_staff(auth.uid()) OR app_private.can_see_task(task_id));
CREATE POLICY "time own write" ON public.time_entries
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND app_private.is_staff(auth.uid()));
CREATE POLICY "time own update" ON public.time_entries
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
CREATE POLICY "time own delete" ON public.time_entries
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "audit readable" ON public.time_entry_audit;
CREATE POLICY "audit readable" ON public.time_entry_audit
FOR SELECT TO authenticated
USING (app_private.is_staff(auth.uid()) OR app_private.can_see_task(task_id));

DROP POLICY IF EXISTS "task files read" ON storage.objects;
DROP POLICY IF EXISTS "task files insert" ON storage.objects;
DROP POLICY IF EXISTS "task files delete" ON storage.objects;
CREATE POLICY "task files read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'task-files'
  AND app_private.can_see_task(NULLIF(split_part(name, '/', 1), '')::uuid)
);
CREATE POLICY "task files insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-files'
  AND app_private.can_see_task(NULLIF(split_part(name, '/', 1), '')::uuid)
);
CREATE POLICY "task files delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'task-files'
  AND app_private.can_see_task(NULLIF(split_part(name, '/', 1), '')::uuid)
);

REVOKE EXECUTE ON FUNCTION public.round_time_entry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.round_time_entry() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;