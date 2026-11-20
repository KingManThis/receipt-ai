-- ReceiptPilot: settings support.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.

-- Lets a signed-in user permanently delete their own account.
-- Their profile, receipts, categories and usage rows are removed by "on delete cascade".
-- (Receipt image files are removed by the app before calling this.)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
