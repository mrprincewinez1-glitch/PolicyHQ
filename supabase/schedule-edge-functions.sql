create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('send-renewal-reminders-daily')
where exists (
  select 1 from cron.job where jobname = 'send-renewal-reminders-daily'
);

select cron.unschedule('send-birthday-messages-daily')
where exists (
  select 1 from cron.job where jobname = 'send-birthday-messages-daily'
);

select cron.unschedule('backup-weekly-data')
where exists (
  select 1 from cron.job where jobname = 'backup-weekly-data'
);

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
