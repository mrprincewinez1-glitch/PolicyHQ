create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  full_name text not null,
  email text,
  phone_number text,
  company_name text,
  avatar_url text,
  whatsapp_enabled boolean default true,
  email_notifications_enabled boolean default true,
  birthday_messages_enabled boolean default true,
  agent_whatsapp_summary_enabled boolean default true,
  reminder_30_enabled boolean default true,
  reminder_14_enabled boolean default true,
  reminder_7_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  phone_number text not null,
  email text,
  date_of_birth date,
  address text,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);

alter table public.profiles
add column if not exists birthday_messages_enabled boolean default true;

alter table public.profiles
add column if not exists agent_whatsapp_summary_enabled boolean default true;

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

alter table public.clients
add column if not exists date_of_birth date;

alter table public.clients
add column if not exists deleted_at timestamptz;

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  policy_number text not null unique,
  policy_type text not null check (policy_type in ('Life', 'Health', 'Motor', 'Property', 'Fire', 'Marine', 'Travel')),
  insurance_category text not null default 'Non-Life' check (insurance_category in ('Life', 'Non-Life', 'Health')),
  vehicle_number text,
  property_location text,
  insurer_name text not null,
  start_date date not null,
  expiry_date date not null,
  premium_amount numeric not null check (premium_amount >= 0),
  currency text default 'GHS',
  status text default 'Active' check (status in ('Active', 'Expired', 'Cancelled')),
  renewal_status text default 'Not Started' check (renewal_status in ('Not Started', 'Reminder Sent', 'Under Renewal', 'Renewed', 'Lapsed')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

alter table public.policies
add column if not exists vehicle_number text;

alter table public.policies
add column if not exists property_location text;

alter table public.policies
add column if not exists insurance_category text;

update public.policies
set insurance_category = case
  when policy_type = 'Life' then 'Life'
  when policy_type = 'Health' then 'Health'
  else 'Non-Life'
end
where insurance_category is null;

alter table public.policies
alter column insurance_category set default 'Non-Life';

alter table public.policies
alter column insurance_category set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.policies'::regclass
    and conname = 'policies_insurance_category_check'
  ) then
    alter table public.policies
    add constraint policies_insurance_category_check
    check (insurance_category in ('Life', 'Non-Life', 'Health'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'policies_vehicle_number_motor_only'
  ) then
    alter table public.policies
    add constraint policies_vehicle_number_motor_only
    check (
      (policy_type = 'Motor' and vehicle_number is not null and length(trim(vehicle_number)) > 0)
      or
      (policy_type <> 'Motor' and vehicle_number is null)
    ) not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'policies_property_location_property_only'
  ) then
    alter table public.policies
    add constraint policies_property_location_property_only
    check (
      (policy_type = 'Property' and property_location is not null and length(trim(property_location)) > 0)
      or
      (policy_type <> 'Property' and property_location is null)
    ) not valid;
  end if;
end;
$$;

alter table public.policies
drop constraint if exists policies_insurer_name_approved;

alter table public.policies
add constraint policies_insurer_name_approved
check (insurer_name in (
  'Aster Life Ghana Limited',
  'Beige Assure Company',
  'Enterprise Life Assurance LTD',
  'Esich Life Assurance Company Ltd.',
  'Exceed Life Assurance Company Limited',
  'First Insurance Company Limited',
  'Ghana Life Insurance Company',
  'GLICO Life Insurance LTD',
  'Hollard Life Assurance Ghana LTD',
  'Impact Life Insurance Limited Company',
  'Emple Life Insurance Ghana LTD',
  'miLife Insurance Company Limited',
  'Old Mutual Life Assurance Company (Ghana) Limited',
  'Pinnacle Life Insurance Company Limited',
  'Prudential Life Insurance Ghana Limited',
  'Quality Life Assurance Company Limited',
  'Sanlam Allianz Life Insurance Ghana LTD',
  'SIC Life Company LTD',
  'StarLife Assurance Limited Company',
  'Vanguard Life Assurance Company Limited',
  'Activa International Insurance Company Limited',
  'Bedrock Insurance Company Limited',
  'Best Assurance Company Limited',
  'Coronation Insurance (Ghana) LTD',
  'Donewell Insurance LTD',
  'Enterprise Insurance LTD',
  'Ghana Union Assurance LTD',
  'Glico General Insurance LTD',
  'Heritage Energy Insurance Company Limited',
  'Hollard Insurance Ghana LTD',
  'Imperial General Assurance Company Limited',
  'Loyalty Insurance Company Limited',
  'Millennium Insurance Company Limited',
  'NSIA Insurance Company Limited',
  'Phoenix Insurance Company Limited',
  'Prime Insurance Company Limited',
  'Priority Insurance LTD',
  'Provident Insurance Company Limited',
  'Quality Insurance Company Limited',
  'Regency Nem Insurance Ghana Limited',
  'Sanlam Allianz General Insurance Ghana LTD',
  'Serene Insurance Company Limited',
  'SIC Insurance PLC',
  'Star Assurance Limited Company',
  'SUNU Assurances Ghana LTD',
  'Unique Insurance Company Limited',
  'Vanguard Assurance Company Limited',
  'Acacia Health Insurance Limited',
  'Ace Medical Insurance Limited',
  'Apex Health Insurance Limited',
  'Cosmopolitan Health Insurance Limited',
  'Dosh Health Insurance Company Limited',
  'Equity Health Insurance Limited',
  'GAB Health Insurance Company LTD',
  'GLICO Healthcare Limited',
  'Kaiser Global Health Limited',
  'Liberty Medical Health Scheme Limited',
  'Metropolitan Health Insurance Ghana Limited',
  'NMH Nationwide Medical Health Insurance Scheme Limited',
  'Octaplus Health Limited',
  'Orange Health Insurance Limited',
  'Phoenix Health Insurance',
  'Premier Health Insurance Company Limited',
  'Rx Health Insurance',
  'Spectra Health Mutual Insurance',
  'StarHealth Insurance Company Limited',
  'Takaful Ghana Health Insurance',
  'Universal Health Insurance Limited',
  'Vitality Health Systems Limited'
)) not valid;

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  commission_rate numeric not null check (commission_rate >= 0),
  commission_amount numeric not null default 0,
  payment_status text default 'Pending' check (payment_status in ('Paid', 'Pending')),
  payment_date date,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  message text not null,
  type text check (type in ('renewal_30', 'renewal_14', 'renewal_7', 'birthday', 'general')),
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email')),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  detail text,
  created_at timestamptz default now()
);

create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  policy_id uuid references public.policies(id) on delete set null,
  template_name text not null,
  sent_at timestamptz default now(),
  status text not null check (status in ('sent', 'failed')),
  message_id text,
  error_reason text,
  created_at timestamptz default now()
);

create table if not exists public.function_error_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  error_message text not null,
  error_stack text,
  created_at timestamptz default now(),
  resolved boolean default false
);

create table if not exists public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz default now(),
  tables_backed_up text[] not null default array[]::text[],
  file_path text,
  status text not null check (status in ('success', 'failed')),
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('viewed', 'updated', 'deleted')),
  table_name text not null,
  record_id uuid not null,
  "timestamp" timestamptz default now()
);

comment on table public.profiles is 'data_classification=PII: stores agent name, email, phone number, company profile details, and avatar path.';
comment on table public.clients is 'data_classification=PII: stores client name, phone number, email, date of birth, and address.';
comment on table public.policies is 'data_classification=PII_LINKED: policy numbers, notes, vehicle numbers, and property locations can identify clients.';
comment on table public.notifications is 'data_classification=PII_LINKED: notification messages may include client names and policy numbers.';
comment on table public.notification_logs is 'data_classification=PII_LINKED: delivery logs are linked to clients and policies.';
comment on table public.whatsapp_logs is 'data_classification=PII_LINKED: WhatsApp delivery logs are linked to client communication.';
comment on table public.audit_log is 'data_classification=SECURITY_AUDIT: records access and changes to client records.';
comment on table public.backup_logs is 'data_classification=CONFIDENTIAL: file paths may point to backups containing PII.';
comment on column public.clients.full_name is 'PII';
comment on column public.clients.phone_number is 'PII';
comment on column public.clients.email is 'PII';
comment on column public.clients.date_of_birth is 'PII';
comment on column public.clients.address is 'PII';
comment on column public.profiles.full_name is 'PII';
comment on column public.profiles.email is 'PII';
comment on column public.profiles.phone_number is 'PII';
comment on column public.policies.vehicle_number is 'PII_LINKED';
comment on column public.policies.property_location is 'PII_LINKED';
comment on column public.policies.notes is 'PII_LINKED';

create index if not exists whatsapp_logs_dedupe_idx
on public.whatsapp_logs (client_id, policy_id, template_name, sent_at desc)
where status = 'sent';

create index if not exists clients_agent_active_idx
on public.clients (agent_id, deleted_at, created_at desc);

create index if not exists audit_log_user_timestamp_idx
on public.audit_log (user_id, "timestamp" desc);

create index if not exists whatsapp_logs_agent_idx
on public.whatsapp_logs (agent_id, sent_at desc);

create index if not exists function_error_logs_unresolved_idx
on public.function_error_logs (resolved, created_at desc);

create index if not exists backup_logs_run_at_idx
on public.backup_logs (run_at desc);

alter table public.notifications
drop constraint if exists notifications_type_check;

alter table public.notifications
add constraint notifications_type_check
check (type in ('renewal_30', 'renewal_14', 'renewal_7', 'birthday', 'general'));

create or replace function public.calculate_commission_amount()
returns trigger
language plpgsql
as $$
declare
  policy_premium numeric;
begin
  select premium_amount into policy_premium
  from public.policies
  where id = new.policy_id;

  new.commission_amount = round((coalesce(policy_premium, 0) * new.commission_rate / 100)::numeric, 2);
  return new;
end;
$$;

drop trigger if exists commissions_calculate_amount on public.commissions;
create trigger commissions_calculate_amount
before insert or update of commission_rate, policy_id on public.commissions
for each row execute function public.calculate_commission_amount();

create or replace function public.refresh_commissions_for_policy()
returns trigger
language plpgsql
as $$
begin
  update public.commissions
  set commission_amount = round((new.premium_amount * commission_rate / 100)::numeric, 2)
  where policy_id = new.id;
  return new;
end;
$$;

drop trigger if exists policies_refresh_commissions on public.policies;
create trigger policies_refresh_commissions
after update of premium_amount on public.policies
for each row execute function public.refresh_commissions_for_policy();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists policies_set_updated_at on public.policies;
create trigger policies_set_updated_at
before update on public.policies
for each row execute function public.set_updated_at();

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone_number, company_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'PolicyHQ Agent'),
    new.email,
    coalesce(new.phone, new.raw_user_meta_data->>'phone_number'),
    new.raw_user_meta_data->>'company_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.policies enable row level security;
alter table public.commissions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_logs enable row level security;
alter table public.whatsapp_logs enable row level security;
alter table public.function_error_logs enable row level security;
alter table public.backup_logs enable row level security;
alter table public.audit_log enable row level security;

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.policies to authenticated;
grant select, insert, update, delete on public.commissions to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select on public.notification_logs to authenticated;
grant select on public.whatsapp_logs to authenticated;
grant select, insert on public.whatsapp_logs to service_role;
grant select on public.function_error_logs to authenticated;
grant insert, update on public.function_error_logs to service_role;
grant select on public.backup_logs to authenticated;
grant insert on public.backup_logs to service_role;
grant insert on public.audit_log to authenticated;
grant select on public.audit_log to authenticated;

grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "Profiles are owner scoped" on public.profiles;
create policy "Profiles are owner scoped"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Clients are agent scoped" on public.clients;
create policy "Clients are agent scoped"
on public.clients for all
using (auth.uid() = agent_id and deleted_at is null)
with check (auth.uid() = agent_id);

drop policy if exists "Policies are agent scoped" on public.policies;
create policy "Policies are agent scoped"
on public.policies for all
using (
  auth.uid() = agent_id and
  exists (
    select 1 from public.clients
    where clients.id = policies.client_id
    and clients.agent_id = auth.uid()
    and clients.deleted_at is null
  )
)
with check (
  auth.uid() = agent_id and
  exists (
    select 1 from public.clients
    where clients.id = policies.client_id
    and clients.agent_id = auth.uid()
    and clients.deleted_at is null
  )
);

drop policy if exists "Commissions are agent scoped" on public.commissions;
create policy "Commissions are agent scoped"
on public.commissions for all
using (
  auth.uid() = agent_id and
  exists (
    select 1
    from public.policies
    join public.clients on clients.id = policies.client_id
    where policies.id = commissions.policy_id
    and policies.agent_id = auth.uid()
    and clients.deleted_at is null
  )
)
with check (
  auth.uid() = agent_id and
  exists (
    select 1
    from public.policies
    join public.clients on clients.id = policies.client_id
    where policies.id = commissions.policy_id
    and policies.agent_id = auth.uid()
    and clients.deleted_at is null
  )
);

drop policy if exists "Notifications are agent scoped" on public.notifications;
create policy "Notifications are agent scoped"
on public.notifications for all
using (auth.uid() = agent_id)
with check (auth.uid() = agent_id);

drop policy if exists "Notification logs are agent scoped" on public.notification_logs;
create policy "Notification logs are agent scoped"
on public.notification_logs for select
using (auth.uid() = agent_id);

drop policy if exists "whatsapp_logs_select_own" on public.whatsapp_logs;
create policy "whatsapp_logs_select_own"
on public.whatsapp_logs for select
to authenticated
using (auth.uid() = agent_id);

drop policy if exists "function_error_logs_admin_select" on public.function_error_logs;
create policy "function_error_logs_admin_select"
on public.function_error_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "function_error_logs_admin_update" on public.function_error_logs;
create policy "function_error_logs_admin_update"
on public.function_error_logs for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "backup_logs_admin_select" on public.backup_logs;
create policy "backup_logs_admin_select"
on public.backup_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "audit_log_insert_own_client_events" on public.audit_log;
create policy "audit_log_insert_own_client_events"
on public.audit_log for insert
to authenticated
with check (
  user_id = auth.uid()
  and table_name = 'clients'
  and action in ('viewed', 'updated', 'deleted')
);

drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select"
on public.audit_log for select
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'avatars';

insert into storage.buckets (id, name, public)
values ('policy-documents', 'policy-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('policy-backups', 'policy-backups', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'policy-backups';

drop policy if exists "Avatar read public" on storage.objects;

drop policy if exists "Agents manage own avatars" on storage.objects;
create policy "Agents manage own avatars"
on storage.objects for all
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "policy_backups_admin_read" on storage.objects;
create policy "policy_backups_admin_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'policy-backups'
  and public.is_admin()
);

drop policy if exists "policy_backups_admin_update" on storage.objects;
create policy "policy_backups_admin_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'policy-backups'
  and public.is_admin()
)
with check (
  bucket_id = 'policy-backups'
  and public.is_admin()
);

drop policy if exists "Agents manage own policy documents" on storage.objects;
create policy "Agents manage own policy documents"
on storage.objects for all
using (bucket_id = 'policy-documents' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'policy-documents' and auth.uid()::text = (storage.foldername(name))[1]);
