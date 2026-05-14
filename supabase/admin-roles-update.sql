-- PolicyHQ admin/agent role foundation
-- Run this in Supabase SQL Editor.

alter table public.profiles
add column if not exists role text not null default 'agent';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
    and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin', 'agent'));
  end if;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and coalesce(new.role, 'agent') <> 'agent' and not public.is_admin() then
    raise exception 'Only admins can create admin profiles.';
  end if;

  if tg_op = 'UPDATE' and old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change profile roles.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
before insert or update of role on public.profiles
for each row execute function public.prevent_profile_role_escalation();

-- Make your founder account the first admin.
update public.profiles
set role = 'admin'
where email = 'mrprincewinez1@gmail.com';

-- Profiles: agents can read/update themselves; admins can view and manage all profiles.
alter table public.profiles enable row level security;

drop policy if exists "Profiles are owner scoped" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid() and role = 'agent');

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "profiles_admin_update_all"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Clients: agents own their rows; admins can read all for platform support/analytics.
alter table public.clients enable row level security;

drop policy if exists "clients_restrict_agent_access" on public.clients;
drop policy if exists "clients_admin_select_all" on public.clients;

create policy "clients_restrict_agent_access"
on public.clients
as restrictive
for all
to authenticated
using (agent_id = auth.uid() or public.is_admin())
with check (agent_id = auth.uid() or public.is_admin());

create policy "clients_admin_select_all"
on public.clients
for select
to authenticated
using (public.is_admin());

-- Policies: agents own their rows; admins can read all for platform support/analytics.
alter table public.policies enable row level security;

drop policy if exists "policies_restrict_agent_access" on public.policies;
drop policy if exists "policies_admin_select_all" on public.policies;

create policy "policies_restrict_agent_access"
on public.policies
as restrictive
for all
to authenticated
using (agent_id = auth.uid() or public.is_admin())
with check (agent_id = auth.uid() or public.is_admin());

create policy "policies_admin_select_all"
on public.policies
for select
to authenticated
using (public.is_admin());

-- Commissions: agents keep editing their own commissions; admins can read all for analytics.
alter table public.commissions enable row level security;

drop policy if exists "commissions_restrict_agent_access" on public.commissions;
drop policy if exists "commissions_admin_select_all" on public.commissions;

create policy "commissions_restrict_agent_access"
on public.commissions
as restrictive
for all
to authenticated
using (agent_id = auth.uid() or public.is_admin())
with check (agent_id = auth.uid() or public.is_admin());

create policy "commissions_admin_select_all"
on public.commissions
for select
to authenticated
using (public.is_admin());

-- Notifications and logs: keep ownership isolation; admins can read for support/analytics.
alter table public.notifications enable row level security;
alter table public.notification_logs enable row level security;

drop policy if exists "notifications_admin_select_all" on public.notifications;
drop policy if exists "notification_logs_admin_select_all" on public.notification_logs;

create policy "notifications_admin_select_all"
on public.notifications
for select
to authenticated
using (public.is_admin());

create policy "notification_logs_admin_select_all"
on public.notification_logs
for select
to authenticated
using (public.is_admin());
