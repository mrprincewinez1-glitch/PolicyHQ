-- One-time cleanup for Ghana phone numbers that were saved as +2330XXXXXXXXX.
-- Correct format example: 0247844844 -> +233247844844.

update public.clients
set phone_number = case
  when regexp_replace(phone_number, '\D', '', 'g') like '2330%' then '+233' || substring(regexp_replace(phone_number, '\D', '', 'g') from 5)
  when regexp_replace(phone_number, '\D', '', 'g') like '0%' and length(regexp_replace(phone_number, '\D', '', 'g')) = 10 then '+233' || substring(regexp_replace(phone_number, '\D', '', 'g') from 2)
  when length(regexp_replace(phone_number, '\D', '', 'g')) = 9 then '+233' || regexp_replace(phone_number, '\D', '', 'g')
  when regexp_replace(phone_number, '\D', '', 'g') like '233%' then '+' || regexp_replace(phone_number, '\D', '', 'g')
  else phone_number
end
where phone_number is not null;

update public.profiles
set phone_number = case
  when regexp_replace(phone_number, '\D', '', 'g') like '2330%' then '+233' || substring(regexp_replace(phone_number, '\D', '', 'g') from 5)
  when regexp_replace(phone_number, '\D', '', 'g') like '0%' and length(regexp_replace(phone_number, '\D', '', 'g')) = 10 then '+233' || substring(regexp_replace(phone_number, '\D', '', 'g') from 2)
  when length(regexp_replace(phone_number, '\D', '', 'g')) = 9 then '+233' || regexp_replace(phone_number, '\D', '', 'g')
  when regexp_replace(phone_number, '\D', '', 'g') like '233%' then '+' || regexp_replace(phone_number, '\D', '', 'g')
  else phone_number
end
where phone_number is not null;
