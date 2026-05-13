alter table public.profiles
  alter column email drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone_number, company_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'PolicyHQ Agent'),
    new.email,
    coalesce(new.phone, new.raw_user_meta_data->>'phone_number'),
    new.raw_user_meta_data->>'company_name'
  );
  return new;
end;
$$;

update public.profiles as profile
set phone_number = coalesce(profile.phone_number, auth_user.phone)
from auth.users as auth_user
where profile.id = auth_user.id
  and auth_user.phone is not null;
