grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;