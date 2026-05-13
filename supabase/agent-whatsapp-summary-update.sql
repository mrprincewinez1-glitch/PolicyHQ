alter table public.profiles
add column if not exists agent_whatsapp_summary_enabled boolean default true;

update public.profiles
set agent_whatsapp_summary_enabled = true
where agent_whatsapp_summary_enabled is null;

notify pgrst, 'reload schema';
