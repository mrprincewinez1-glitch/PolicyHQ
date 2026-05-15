-- PolicyHQ Supabase Edge Function critical error logging
-- Run this in Supabase SQL Editor.

create table if not exists public.function_error_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  error_message text not null,
  error_stack text,
  created_at timestamptz default now(),
  resolved boolean default false
);

create index if not exists function_error_logs_unresolved_idx
on public.function_error_logs (resolved, created_at desc);

alter table public.function_error_logs enable row level security;

grant select on public.function_error_logs to authenticated;
grant insert, update on public.function_error_logs to service_role;

drop policy if exists "function_error_logs_admin_select" on public.function_error_logs;
drop policy if exists "function_error_logs_admin_update" on public.function_error_logs;

create policy "function_error_logs_admin_select"
on public.function_error_logs
for select
to authenticated
using (public.is_admin());

create policy "function_error_logs_admin_update"
on public.function_error_logs
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
