CREATE TYPE public.app_role AS ENUM ('admin','member','client');
CREATE TYPE public.task_status AS ENUM ('requested','in_progress','review','completed');
CREATE TYPE public.task_priority AS ENUM ('low','normal','high','urgent');

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  retainer_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  avatar_url text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'requested',
  priority public.task_priority NOT NULL DEFAULT 'normal',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence text,
  start_date date,
  due_date date,
  position numeric NOT NULL DEFAULT 1000,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.task_followers (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  minutes integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hour_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  hours numeric NOT NULL,
  kind text NOT NULL DEFAULT 'package',
  effective_month date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hour_credits_retainer_month ON public.hour_credits (client_id, effective_month) WHERE kind = 'retainer';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','member'))
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_see_task(_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (public.is_staff(auth.uid()) OR t.client_id = public.my_client_id())
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin'::public.app_role ELSE 'member'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.round_time_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE raw_minutes numeric;
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    raw_minutes := GREATEST(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0, 0);
    NEW.minutes := GREATEST(CEIL(raw_minutes / 15.0) * 15, 15);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER time_entries_round BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.round_time_entry();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.profiles, public.user_roles, public.tasks, public.task_followers, public.task_comments, public.task_attachments, public.time_entries, public.hour_credits TO authenticated;
GRANT ALL ON public.clients, public.profiles, public.user_roles, public.tasks, public.task_followers, public.task_comments, public.task_attachments, public.time_entries, public.hour_credits TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hour_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients readable" ON public.clients FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR id = public.my_client_id());
CREATE POLICY "clients admin write" ON public.clients FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles readable" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles admin write" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "tasks readable" ON public.tasks FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.my_client_id());
CREATE POLICY "tasks insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()) OR client_id = public.my_client_id());
CREATE POLICY "tasks update" ON public.tasks FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "tasks delete" ON public.tasks FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "followers readable" ON public.task_followers FOR SELECT TO authenticated
USING (public.can_see_task(task_id));
CREATE POLICY "followers write" ON public.task_followers FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "comments readable" ON public.task_comments FOR SELECT TO authenticated
USING (public.can_see_task(task_id));
CREATE POLICY "comments insert" ON public.task_comments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.can_see_task(task_id));
CREATE POLICY "comments own delete" ON public.task_comments FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "attachments readable" ON public.task_attachments FOR SELECT TO authenticated
USING (public.can_see_task(task_id));
CREATE POLICY "attachments insert" ON public.task_attachments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.can_see_task(task_id));
CREATE POLICY "attachments delete" ON public.task_attachments FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "time readable" ON public.time_entries FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR public.can_see_task(task_id));
CREATE POLICY "time own write" ON public.time_entries FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "time own update" ON public.time_entries FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "time own delete" ON public.time_entries FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "credits readable" ON public.hour_credits FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.my_client_id());
CREATE POLICY "credits admin write" ON public.hour_credits FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));