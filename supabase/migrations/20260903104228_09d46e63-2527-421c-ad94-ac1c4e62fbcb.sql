grant select on public.task_categories to authenticated;
grant select, insert, update on public.proven_tasks to authenticated;
grant all on public.proven_tasks to service_role;
grant select on public.ghl_sub_accounts to authenticated;
grant all on public.ghl_sub_accounts to service_role;