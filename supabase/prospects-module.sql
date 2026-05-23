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
