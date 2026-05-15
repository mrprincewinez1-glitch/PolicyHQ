-- PolicyHQ admin access foundation
-- Run this in Supabase SQL Editor if admin access has not already been installed.

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

update public.profiles
set role = 'admin'
where email = 'mrprincewinez1@gmail.com';

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.policies enable row level security;
alter table public.commissions enable row level security;

drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "clients_admin_select_all" on public.clients;
drop policy if exists "policies_admin_select_all" on public.policies;
drop policy if exists "commissions_admin_select_all" on public.commissions;

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

create policy "clients_admin_select_all"
on public.clients
for select
to authenticated
using (public.is_admin());

create policy "policies_admin_select_all"
on public.policies
for select
to authenticated
using (public.is_admin());

create policy "commissions_admin_select_all"
on public.commissions
for select
to authenticated
using (public.is_admin());
