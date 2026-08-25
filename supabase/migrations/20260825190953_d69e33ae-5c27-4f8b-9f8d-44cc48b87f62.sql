CREATE OR REPLACE FUNCTION public.verify_digest_cron_token(_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_private.config
    WHERE key = 'digest_cron_token' AND value = _token
  )
$$;

REVOKE EXECUTE ON FUNCTION public.verify_digest_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_digest_cron_token(text) TO service_role;