-- ReceiptPilot initial schema.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1. Profiles: one row per user, created automatically at sign-up.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  country text not null default 'US',
  currency text not null default 'USD',
  tax_year_start_month int not null default 1 check (tax_year_start_month between 1 and 12),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Categories: built-in rows (user_id is null) follow IRS Schedule C; users can add their own.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  schedule_c_line text,
  deductible_percent int not null default 100,
  unique (user_id, name)
);

insert into public.categories (name, schedule_c_line, deductible_percent) values
  ('Advertising & marketing',        'Line 8',   100),
  ('Car & truck expenses',           'Line 9',   100),
  ('Commissions & fees',             'Line 10',  100),
  ('Contract labor',                 'Line 11',  100),
  ('Insurance (business)',           'Line 15',  100),
  ('Interest (business)',            'Line 16',  100),
  ('Legal & professional services',  'Line 17',  100),
  ('Office expenses',                'Line 18',  100),
  ('Rent or lease – equipment',      'Line 20a', 100),
  ('Rent or lease – property',       'Line 20b', 100),
  ('Repairs & maintenance',          'Line 21',  100),
  ('Supplies',                       'Line 22',  100),
  ('Taxes & licenses',               'Line 23',  100),
  ('Travel',                         'Line 24a', 100),
  ('Meals (business)',               'Line 24b', 50),
  ('Utilities',                      'Line 25',  100),
  ('Software & subscriptions',       'Line 27a', 100),
  ('Education & training',           'Line 27a', 100),
  ('Phone & internet',               'Line 27a', 100),
  ('Bank & payment fees',            'Line 27a', 100),
  ('Other business expense',         'Line 27a', 100),
  ('Personal (not deductible)',      null,       0);

-- 3. Receipts.
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_path text,
  vendor text,
  receipt_date date,
  subtotal numeric(12, 2),
  tax numeric(12, 2),
  total numeric(12, 2),
  currency text not null default 'USD',
  category_id uuid references public.categories (id) on delete set null,
  payment_method text,
  notes text,
  ai_confidence numeric(3, 2) check (ai_confidence between 0 and 1),
  ai_raw jsonb,
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receipts_user_date_idx on public.receipts (user_id, receipt_date desc);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger receipts_touch before update on public.receipts
  for each row execute function public.touch_updated_at();

-- 4. Monthly usage, for free-plan limits. Written only by the server (Edge Function).
create table public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  receipts_processed int not null default 0,
  primary key (user_id, month)
);

-- 5. Row Level Security: every user sees only their own data.
alter table public.profiles   enable row level security;
alter table public.categories enable row level security;
alter table public.receipts   enable row level security;
alter table public.usage      enable row level security;

create policy "own profile: read"   on public.profiles for select using (auth.uid() = id);
-- Users may edit their profile, but not change their own plan.
create policy "own profile: update" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and plan = (select p.plan from public.profiles p where p.id = auth.uid()));

create policy "categories: read built-in and own" on public.categories for select
  using (user_id is null or user_id = auth.uid());
create policy "categories: insert own" on public.categories for insert with check (user_id = auth.uid());
create policy "categories: update own" on public.categories for update using (user_id = auth.uid());
create policy "categories: delete own" on public.categories for delete using (user_id = auth.uid());

create policy "receipts: read own"   on public.receipts for select using (user_id = auth.uid());
create policy "receipts: insert own" on public.receipts for insert with check (user_id = auth.uid());
create policy "receipts: update own" on public.receipts for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "receipts: delete own" on public.receipts for delete using (user_id = auth.uid());

create policy "usage: read own" on public.usage for select using (user_id = auth.uid());

-- 6. Private storage bucket. Files are stored as <user-id>/<file-name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);

create policy "receipt files: read own" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipt files: upload own" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipt files: delete own" on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
