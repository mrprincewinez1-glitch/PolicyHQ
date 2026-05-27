create extension if not exists pgcrypto;

create table if not exists public.commission_statement_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  statement_name text,
  statement_kind text check (statement_kind in ('CSV', 'Excel', 'PDF', 'CSV, Excel, or PDF')),
  statement_month date not null,
  matched_count integer not null default 0 check (matched_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  unknown_count integer not null default 0 check (unknown_count >= 0),
  statement_rows_count integer not null default 0 check (statement_rows_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.lapse_shield_cases (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.commission_statement_runs(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  status text not null default 'Missing from statement'
    check (status in ('Missing from statement', 'Contacted', 'Client says paid', 'Payment confirmed', 'Lapsed')),
  last_contacted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (run_id, policy_id)
);

create index if not exists commission_statement_runs_agent_active_idx
on public.commission_statement_runs (agent_id, is_active, created_at desc);

create index if not exists lapse_shield_cases_agent_open_idx
on public.lapse_shield_cases (agent_id, resolved_at, created_at desc);

create index if not exists lapse_shield_cases_policy_idx
on public.lapse_shield_cases (policy_id);

alter table public.commission_statement_runs enable row level security;
alter table public.lapse_shield_cases enable row level security;

grant select, insert, update, delete on table public.commission_statement_runs to authenticated;
grant select, insert, update, delete on table public.lapse_shield_cases to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'commission_statement_runs'
    and policyname = 'Agents manage their own commission statement runs'
  ) then
    create policy "Agents manage their own commission statement runs"
    on public.commission_statement_runs
    for all
    to authenticated
    using (agent_id = auth.uid())
    with check (agent_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'lapse_shield_cases'
    and policyname = 'Agents manage their own lapse shield cases'
  ) then
    create policy "Agents manage their own lapse shield cases"
    on public.lapse_shield_cases
    for all
    to authenticated
    using (agent_id = auth.uid())
    with check (agent_id = auth.uid());
  end if;
end;
$$;
