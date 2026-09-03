CREATE TABLE public.client_ghl_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  location_id text,
  agency_name text,
  connected_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.client_ghl_connections TO service_role;

ALTER TABLE public.client_ghl_connections ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated on purpose: the API key is only read by
-- trusted server code using the service role.

CREATE TRIGGER client_ghl_connections_updated_at
BEFORE UPDATE ON public.client_ghl_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();