select
  tables.tablename as table_name,
  tables.rowsecurity as rls_enabled,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'policy_name', policies.policyname,
        'command', policies.cmd,
        'roles', policies.roles,
        'using', policies.qual,
        'with_check', policies.with_check
      )
      order by policies.policyname
    ) filter (where policies.policyname is not null),
    '[]'::jsonb
  ) as policies,
  count(policies.policyname) as policy_count,
  case
    when tables.rowsecurity and count(policies.policyname) = 0 then 'FLAG: RLS enabled but zero policies'
    when not tables.rowsecurity then 'FLAG: RLS disabled'
    else 'OK'
  end as audit_status
from pg_tables tables
left join pg_policies policies
  on policies.schemaname = tables.schemaname
 and policies.tablename = tables.tablename
where tables.schemaname = 'public'
  and tables.tablename in ('profiles', 'agents', 'clients', 'policies', 'commissions', 'notifications', 'notification_logs')
group by tables.tablename, tables.rowsecurity
order by tables.tablename;
