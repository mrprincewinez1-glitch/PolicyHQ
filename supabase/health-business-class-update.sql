alter table public.policies
add column if not exists insurance_category text;

alter table public.policies
drop constraint if exists policies_insurance_category_check;

update public.policies
set insurance_category = case
  when policy_type = 'Life' then 'Life'
  when policy_type = 'Health' then 'Health'
  else 'Non-Life'
end
where insurance_category is null
   or policy_type in ('Life', 'Health');

alter table public.policies
alter column insurance_category set default 'Non-Life';

alter table public.policies
alter column insurance_category set not null;

alter table public.policies
add constraint policies_insurance_category_check
check (insurance_category in ('Life', 'Non-Life', 'Health'));

notify pgrst, 'reload schema';
