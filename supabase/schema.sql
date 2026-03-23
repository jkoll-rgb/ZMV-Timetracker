-- =====================================================
-- ZMV Time Tracker — Supabase Schema (fixed order)
-- =====================================================

-- 1. Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  role text not null default 'zmv' check (role in ('admin', 'zmv')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "Profiles: read own or admin reads all"
  on public.profiles for select using (
    auth.uid() = id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Profiles: users update own"
  on public.profiles for update using (auth.uid() = id);
create policy "Profiles: admin insert"
  on public.profiles for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    or auth.uid() = id
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'zmv')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Clients (WITHOUT zmv policy yet — assignments table needed first)
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact text,
  contract_hours_per_week numeric(5,2) not null default 0,
  hourly_rate numeric(8,2) not null default 0,
  extra_hourly_rate numeric(8,2) not null default 0,
  notes text,
  created_at timestamptz default now()
);
alter table public.clients enable row level security;

create policy "Clients: admin full access"
  on public.clients for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 3. Assignments (must exist before clients zmv policy)
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  zmv_id uuid references public.profiles(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete cascade not null,
  active_from date not null default current_date,
  active_until date,
  unique(zmv_id, client_id)
);
alter table public.assignments enable row level security;

create policy "Assignments: admin full access"
  on public.assignments for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Assignments: zmv reads own"
  on public.assignments for select using (zmv_id = auth.uid());

-- NOW add the zmv policy on clients (assignments table exists)
create policy "Clients: zmv reads assigned"
  on public.clients for select using (
    exists (
      select 1 from public.assignments
      where client_id = clients.id
        and zmv_id = auth.uid()
        and (active_until is null or active_until >= current_date)
    )
  );

-- 4. Time Entries
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  zmv_id uuid references public.profiles(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete cascade not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes integer not null,
  type text not null default 'vertraglich' check (type in ('vertraglich', 'sonderstunde')),
  notes text,
  created_at timestamptz default now()
);
alter table public.time_entries enable row level security;

create policy "TimeEntries: admin full access"
  on public.time_entries for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "TimeEntries: zmv manages own"
  on public.time_entries for all using (zmv_id = auth.uid());

-- 5. Screenshots
create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid references public.time_entries(id) on delete cascade not null,
  image_url text not null,
  comment text,
  captured_at timestamptz default now()
);
alter table public.screenshots enable row level security;

create policy "Screenshots: admin full access"
  on public.screenshots for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Screenshots: zmv manages own"
  on public.screenshots for all using (
    exists (
      select 1 from public.time_entries
      where id = screenshots.time_entry_id and zmv_id = auth.uid()
    )
  );

-- 6. Invoices
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid references public.clients(id) on delete cascade not null,
  period_from date not null,
  period_to date not null,
  positions jsonb not null default '[]'::jsonb,
  total_net numeric(10,2) not null default 0,
  total_gross numeric(10,2) not null default 0,
  status text not null default 'entwurf' check (status in ('entwurf', 'gesendet', 'bezahlt')),
  payment_due_days integer default 14,
  paid_at date,
  created_at timestamptz default now()
);
alter table public.invoices enable row level security;

create policy "Invoices: admin only"
  on public.invoices for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 7. Storage bucket
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict do nothing;

create policy "Screenshots storage: authenticated upload"
  on storage.objects for insert with check (
    bucket_id = 'screenshots' and auth.role() = 'authenticated'
  );
create policy "Screenshots storage: owner or admin read"
  on storage.objects for select using (
    bucket_id = 'screenshots' and auth.role() = 'authenticated'
  );
create policy "Screenshots storage: owner or admin delete"
  on storage.objects for delete using (
    bucket_id = 'screenshots' and auth.role() = 'authenticated'
  );

-- 8. Helper: next invoice number
create or replace function public.next_invoice_number()
returns text language plpgsql as $$
declare
  yr text := extract(year from current_date)::text;
  seq int;
begin
  select coalesce(max(
    cast(split_part(invoice_number, '-', 3) as int)
  ), 0) + 1
  into seq
  from public.invoices
  where invoice_number like 'RE-' || yr || '-%';
  return 'RE-' || yr || '-' || lpad(seq::text, 4, '0');
end;
$$;
