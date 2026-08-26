ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id);

CREATE TABLE public.client_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('archived','restored')),
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_audit TO authenticated;
GRANT ALL ON public.client_audit TO service_role;

ALTER TABLE public.client_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read client audit"
ON public.client_audit FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins can write client audit"
ON public.client_audit FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE INDEX idx_client_audit_client ON public.client_audit(client_id, created_at DESC);