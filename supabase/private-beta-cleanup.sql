-- PolicyHQ private beta cleanup helper.
-- Run the SELECT sections first. Only run DELETE sections after reviewing the rows.

-- 1. Preview noisy WhatsApp agent-summary logs from temporary testing.
select
  id,
  created_at,
  channel,
  status,
  detail
from public.notification_logs
where detail like 'agent_summary:%'
order by created_at desc;

-- Delete noisy WhatsApp agent-summary logs.
-- delete from public.notification_logs
-- where detail like 'agent_summary:%';

-- 2. Preview duplicate renewal notifications created during manual testing.
select
  id,
  created_at,
  message
from public.notifications
where message like '%renewal reminder sent for%'
order by created_at desc;

-- Delete duplicate test renewal notifications while preserving other alerts.
-- delete from public.notifications
-- where message like '%renewal reminder sent for%';

-- 3. Preview policies with policy numbers that fail the MVP format rule.
select
  id,
  policy_number,
  policy_type,
  insurer_name,
  created_at
from public.policies
where policy_number !~ '^[A-Z0-9./-]{3,40}$'
order by created_at desc;

-- Do not auto-delete policies above. Edit them in PolicyHQ unless they are pure test data.

notify pgrst, 'reload schema';
