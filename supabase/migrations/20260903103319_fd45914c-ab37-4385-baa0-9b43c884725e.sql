create table public.ghl_sub_accounts (
  id uuid not null default gen_random_uuid() primary key,
  ghl_id text not null unique,
  name text not null,
  synced_at timestamptz not null default now()
);
grant select on public.ghl_sub_accounts to authenticated;
grant all on public.ghl_sub_accounts to service_role;
alter table public.ghl_sub_accounts enable row level security;
create policy "Signed-in users can read sub-accounts" on public.ghl_sub_accounts for select to authenticated using (true);
