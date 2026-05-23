-- PolicyHQ prospects module.
-- Run this once in the Supabase SQL editor before using /prospects in production.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone_number text not null,
  status text not null default 'New' check (status in ('New', 'Interested', 'Not Interested', 'Call Back', 'Converted')),
  follow_up_date date,
  notes text,
  created_at timestamptz default now()
);

alter table public.prospects
add column if not exists agent_id uuid;

alter table public.prospects
add column if not exists full_name text;

alter table public.prospects
add column if not exists phone_number text;

alter table public.prospects
add column if not exists status text default 'New';

alter table public.prospects
add column if not exists follow_up_date date;

alter table public.prospects
add column if not exists notes text;

alter table public.prospects
add column if not exists created_at timestamptz default now();

update public.prospects
set status = 'New'
where status is null;

alter table public.prospects
alter column agent_id set not null;

alter table public.prospects
alter column full_name set not null;

alter table public.prospects
alter column phone_number set not null;

alter table public.prospects
alter column status set not null;

alter table public.prospects
alter column status set default 'New';

alter table public.prospects
alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.prospects'::regclass
    and conname = 'prospects_agent_id_fkey'
  ) then
    alter table public.prospects
    add constraint prospects_agent_id_fkey
    foreign key (agent_id)
    references auth.users(id)
    on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.prospects'::regclass
    and conname = 'prospects_status_check'
  ) then
    alter table public.prospects
    add constraint prospects_status_check
    check (status in ('New', 'Interested', 'Not Interested', 'Call Back', 'Converted'));
  end if;
end;
$$;

create index if not exists prospects_agent_status_followup_idx
on public.prospects (agent_id, status, follow_up_date, created_at desc);

alter table public.prospects enable row level security;

grant select, insert, update, delete on public.prospects to authenticated;

drop policy if exists "Prospects are agent scoped" on public.prospects;
create policy "Prospects are agent scoped"
on public.prospects
for all
to authenticated
using (auth.uid() = agent_id)
with check (auth.uid() = agent_id);

drop policy if exists "prospects_admin_select_all" on public.prospects;
create policy "prospects_admin_select_all"
on public.prospects
for select
to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
