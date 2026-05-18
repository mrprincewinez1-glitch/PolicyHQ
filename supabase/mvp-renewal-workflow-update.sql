-- PolicyHQ MVP renewal workflow update.
-- Run this once in Supabase SQL Editor before using the new renewal workflow.

alter table public.policies
drop constraint if exists policies_renewal_status_check;

update public.policies
set renewal_status = case renewal_status
  when 'Not Started' then 'Upcoming'
  when 'Reminder Sent' then 'Contacted'
  when 'Under Renewal' then 'Quote Requested'
  when 'Lapsed' then 'Lost'
  else renewal_status
end
where renewal_status in ('Not Started', 'Reminder Sent', 'Under Renewal', 'Lapsed');

alter table public.policies
alter column renewal_status set default 'Upcoming';

alter table public.policies
add constraint policies_renewal_status_check
check (renewal_status in ('Upcoming', 'Contacted', 'Quote Requested', 'Payment Pending', 'Renewed', 'Lost'));

create table if not exists public.activity_notes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete cascade,
  note_text text not null check (char_length(note_text) between 2 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  constraint activity_notes_has_subject check (client_id is not null or policy_id is not null)
);

comment on table public.activity_notes is 'data_classification=PII_LINKED: stores agent-written client and policy relationship notes.';
comment on column public.activity_notes.note_text is 'PII_LINKED';

alter table public.activity_notes enable row level security;

drop policy if exists "Activity notes are agent scoped" on public.activity_notes;
create policy "Activity notes are agent scoped"
on public.activity_notes
for all
to authenticated
using (agent_id = auth.uid())
with check (agent_id = auth.uid());

grant select, insert, update, delete on public.activity_notes to authenticated;

create index if not exists activity_notes_agent_id_created_at_idx
on public.activity_notes(agent_id, created_at desc);

create index if not exists activity_notes_client_id_idx
on public.activity_notes(client_id);

create index if not exists activity_notes_policy_id_idx
on public.activity_notes(policy_id);
