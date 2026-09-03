drop policy if exists "Signed-in users can read sub-accounts" on public.ghl_sub_accounts;

create policy "Staff can read sub-accounts"
on public.ghl_sub_accounts
for select
to authenticated
using (public.is_staff(auth.uid()));