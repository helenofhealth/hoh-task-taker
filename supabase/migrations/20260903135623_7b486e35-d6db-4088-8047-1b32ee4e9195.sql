create or replace function public.guard_profile_client_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Trusted server-side operations (service role / no session) are allowed.
  if auth.uid() is null then
    return NEW;
  end if;

  if NEW.client_id is distinct from OLD.client_id
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Only admins can change which client a profile belongs to';
  end if;
  return NEW;
end;
$function$;