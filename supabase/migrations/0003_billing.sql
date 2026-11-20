-- ReceiptPilot: paid plan support.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.profiles add column if not exists stripe_customer_id text unique;

-- Users may edit their own profile, but never their plan or Stripe link
-- (those are set only by the stripe-webhook function).
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and plan = (select p.plan from public.profiles p where p.id = auth.uid())
    and stripe_customer_id is not distinct from
        (select p.stripe_customer_id from public.profiles p where p.id = auth.uid())
  );
