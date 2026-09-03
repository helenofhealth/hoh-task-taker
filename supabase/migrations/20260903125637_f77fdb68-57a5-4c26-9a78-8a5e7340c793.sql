CREATE TABLE public.client_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  profile_done boolean NOT NULL DEFAULT false,
  hours_reviewed boolean NOT NULL DEFAULT false,
  first_task_done boolean NOT NULL DEFAULT false,
  tour_done boolean NOT NULL DEFAULT false,
  welcome_email_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.client_onboarding TO authenticated;
GRANT ALL ON public.client_onboarding TO service_role;

ALTER TABLE public.client_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own onboarding"
ON public.client_onboarding FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "Users create their own onboarding"
ON public.client_onboarding FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their own onboarding"
ON public.client_onboarding FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER client_onboarding_set_updated_at
BEFORE UPDATE ON public.client_onboarding
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX client_onboarding_client_id_idx ON public.client_onboarding(client_id);