alter default privileges in schema public
revoke select, insert, update, delete on tables from authenticated;

alter default privileges in schema public
revoke usage, select on sequences from authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.policies to authenticated;
grant select, insert, update, delete on public.commissions to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select on public.notification_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

update storage.buckets
set public = false
where id = 'avatars';

drop policy if exists "Avatar read public" on storage.objects;

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

notify pgrst, 'reload schema';
