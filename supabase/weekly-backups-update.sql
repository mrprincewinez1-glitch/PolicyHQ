-- PolicyHQ weekly client and policy CSV backups
-- Run this in Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('policy-backups', 'policy-backups', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'policy-backups';

create table if not exists public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz default now(),
  tables_backed_up text[] not null default array[]::text[],
  file_path text,
  status text not null check (status in ('success', 'failed')),
  created_at timestamptz default now()
);

create index if not exists backup_logs_run_at_idx
on public.backup_logs (run_at desc);

alter table public.backup_logs enable row level security;

grant select on public.backup_logs to authenticated;
grant insert on public.backup_logs to service_role;

drop policy if exists "backup_logs_admin_select" on public.backup_logs;
create policy "backup_logs_admin_select"
on public.backup_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "policy_backups_admin_read" on storage.objects;
create policy "policy_backups_admin_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'policy-backups'
  and public.is_admin()
);

drop policy if exists "policy_backups_admin_update" on storage.objects;
create policy "policy_backups_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'policy-backups'
  and public.is_admin()
)
with check (
  bucket_id = 'policy-backups'
  and public.is_admin()
);
