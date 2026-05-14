-- PolicyHQ WhatsApp delivery logs and 24-hour deduplication support
-- Run this in Supabase SQL Editor.

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

create index if not exists whatsapp_logs_dedupe_idx
on public.whatsapp_logs (client_id, policy_id, template_name, sent_at desc)
where status = 'sent';

create index if not exists whatsapp_logs_agent_idx
on public.whatsapp_logs (agent_id, sent_at desc);

alter table public.whatsapp_logs enable row level security;

grant select on public.whatsapp_logs to authenticated;
grant select, insert on public.whatsapp_logs to service_role;

drop policy if exists "whatsapp_logs_select_own" on public.whatsapp_logs;
drop policy if exists "whatsapp_logs_admin_select_all" on public.whatsapp_logs;

create policy "whatsapp_logs_select_own"
on public.whatsapp_logs
for select
to authenticated
using (agent_id = auth.uid());

create policy "whatsapp_logs_admin_select_all"
on public.whatsapp_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);
