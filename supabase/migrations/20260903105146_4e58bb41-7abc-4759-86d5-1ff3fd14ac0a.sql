REVOKE ALL ON FUNCTION public.record_invite_open(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_invite_open(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.record_invite_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invite_open(uuid) TO service_role;