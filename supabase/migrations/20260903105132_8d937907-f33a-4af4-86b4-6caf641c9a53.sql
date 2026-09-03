CREATE TABLE public.client_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_invites TO authenticated;
GRANT ALL ON public.client_invites TO service_role;

ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view client invites"
  ON public.client_invites FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER client_invites_updated_at
  BEFORE UPDATE ON public.client_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX client_invites_client_idx ON public.client_invites (client_id, sent_at DESC);

-- Records an email open from the tracking pixel. Returns nothing sensitive.
CREATE OR REPLACE FUNCTION public.record_invite_open(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.client_invites
  SET opened_at = COALESCE(opened_at, now()),
      last_opened_at = now(),
      open_count = open_count + 1
  WHERE token = _token;
$$;

REVOKE ALL ON FUNCTION public.record_invite_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invite_open(uuid) TO service_role;