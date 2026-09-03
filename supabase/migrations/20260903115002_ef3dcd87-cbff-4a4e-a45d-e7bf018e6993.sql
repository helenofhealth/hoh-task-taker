GRANT EXECUTE ON FUNCTION public.my_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;