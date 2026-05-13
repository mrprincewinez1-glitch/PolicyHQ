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
    select 1
    from pg_constraint
    where conrelid = 'public.policies'::regclass
      and conname = 'policies_insurance_category_check'
  ) then
    alter table public.policies
    add constraint policies_insurance_category_check
    check (insurance_category in ('Life', 'Non-Life', 'Health'));
  end if;
end;
$$;

notify pgrst, 'reload schema';
