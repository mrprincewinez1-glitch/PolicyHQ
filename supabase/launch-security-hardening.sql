-- PolicyHQ launch security hardening.
-- Run this after setting the `policyhq_cron_secret` Vault secret.

-- 1. Policy numbers should be unique per agent, not globally across the platform.
alter table public.policies
drop constraint if exists policies_policy_number_key;

create unique index if not exists policies_agent_policy_number_unique_idx
on public.policies (agent_id, policy_number);

-- 2. Admins need explicit read access for platform support and analytics.
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

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "clients_admin_select_all" on public.clients;
create policy "clients_admin_select_all"
on public.clients
for select
to authenticated
using (public.is_admin());

drop policy if exists "policies_admin_select_all" on public.policies;
create policy "policies_admin_select_all"
on public.policies
for select
to authenticated
using (public.is_admin());

drop policy if exists "commissions_admin_select_all" on public.commissions;
create policy "commissions_admin_select_all"
on public.commissions
for select
to authenticated
using (public.is_admin());

drop policy if exists "notifications_admin_select_all" on public.notifications;
create policy "notifications_admin_select_all"
on public.notifications
for select
to authenticated
using (public.is_admin());

drop policy if exists "notification_logs_admin_select_all" on public.notification_logs;
create policy "notification_logs_admin_select_all"
on public.notification_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "whatsapp_logs_admin_select_all" on public.whatsapp_logs;
create policy "whatsapp_logs_admin_select_all"
on public.whatsapp_logs
for select
to authenticated
using (public.is_admin());

-- 3. Recreate cron jobs with the additional trusted cron-secret header.
-- Requires Vault secrets:
--   project_url
--   service_role_jwt
--   policyhq_cron_secret
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('send-renewal-reminders-daily')
where exists (select 1 from cron.job where jobname = 'send-renewal-reminders-daily');

select cron.unschedule('send-birthday-messages-daily')
where exists (select 1 from cron.job where jobname = 'send-birthday-messages-daily');

select cron.unschedule('backup-weekly-data')
where exists (select 1 from cron.job where jobname = 'backup-weekly-data');

select cron.schedule(
  'send-renewal-reminders-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-renewal-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt'),
      'x-policyhq-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'policyhq_cron_secret')
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);

select cron.schedule(
  'send-birthday-messages-daily',
  '5 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-birthday-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt'),
      'x-policyhq-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'policyhq_cron_secret')
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);

select cron.schedule(
  'backup-weekly-data',
  '0 0 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/backup-weekly-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt'),
      'x-policyhq-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'policyhq_cron_secret')
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);
