alter table public.clients
add column if not exists deleted_at timestamptz;

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

create index if not exists clients_agent_active_idx
on public.clients (agent_id, deleted_at, created_at desc);

create index if not exists audit_log_user_timestamp_idx
on public.audit_log (user_id, "timestamp" desc);

alter table public.audit_log enable row level security;
grant insert on public.audit_log to authenticated;
grant select on public.audit_log to authenticated;

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
