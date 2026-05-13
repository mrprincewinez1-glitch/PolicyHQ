alter table public.policies
add column if not exists vehicle_number text;

alter table public.policies
add column if not exists property_location text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.policies'::regclass
      and conname = 'policies_vehicle_number_motor_only'
  ) then
    alter table public.policies
    add constraint policies_vehicle_number_motor_only
    check (
      (policy_type = 'Motor' and vehicle_number is not null and length(trim(vehicle_number)) > 0)
      or
      (policy_type <> 'Motor' and vehicle_number is null)
    ) not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.policies'::regclass
      and conname = 'policies_property_location_property_only'
  ) then
    alter table public.policies
    add constraint policies_property_location_property_only
    check (
      (policy_type = 'Property' and property_location is not null and length(trim(property_location)) > 0)
      or
      (policy_type <> 'Property' and property_location is null)
    ) not valid;
  end if;
end;
$$;

notify pgrst, 'reload schema';
