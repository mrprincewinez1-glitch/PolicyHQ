alter table public.clients
  add column if not exists date_of_birth date;

alter table public.profiles
  add column if not exists birthday_messages_enabled boolean default true;

alter table public.profiles
  alter column email drop not null;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('renewal_30', 'renewal_14', 'renewal_7', 'birthday', 'general'));

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
