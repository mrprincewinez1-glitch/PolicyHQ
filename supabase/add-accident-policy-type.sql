alter table public.policies
drop constraint if exists policies_policy_type_check;

alter table public.policies
add constraint policies_policy_type_check
check (policy_type in ('Life', 'Health', 'Motor', 'Property', 'Fire', 'Marine', 'Travel', 'Accident'));
