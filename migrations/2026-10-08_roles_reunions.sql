-- Appliquée le 2026-10-08 (Supabase MotoCam) — Rôles libres + responsabilités, module Réunions
alter table public.kp_allowed add column if not exists responsibilities text;
alter table public.kp_members add column if not exists responsibilities text;
create or replace function public.kp_create_profile() returns trigger language plpgsql security definer set search_path = public as $$
declare a record; palette text[] := array['#1E3A5F','#B4532A','#2E7D32','#2F5A9E','#7B3F9E','#C77700'];
begin
  select * into a from public.kp_allowed where lower(email) = lower(new.email);
  insert into public.kp_members(user_id, email, name, role, responsibilities, color, is_admin)
  values (new.id, lower(new.email), coalesce(a.name, split_part(new.email,'@',1)), coalesce(a.role,'membre'), a.responsibilities,
          palette[1 + (abs(hashtext(new.email)) % array_length(palette,1))], coalesce(a.role,'') = 'admin')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop policy if exists kp_allowed_upd on public.kp_allowed; create policy kp_allowed_upd on public.kp_allowed for update using (public.kp_is_admin());

create table if not exists public.kp_meetings (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.kp_projects(id) on delete set null,
  title text not null,
  kind text not null default 'présentiel' check (kind in ('présentiel','visio','hybride')),
  starts_at timestamptz not null,
  duration_min integer not null default 60,
  location text, link text,
  objectives text,
  agenda jsonb not null default '[]'::jsonb,
  participants uuid[] not null default '{}',
  externals text,
  status text not null default 'planifiée' check (status in ('planifiée','en cours','terminée','annulée')),
  started_at timestamptz, ended_at timestamptz,
  minutes_html text, minutes_doc_id uuid references public.kp_docs(id) on delete set null, minutes_sent_at timestamptz, minutes_ai boolean not null default false,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.kp_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.kp_meetings(id) on delete cascade,
  author uuid,
  kind text not null default 'note' check (kind in ('note','idée','décision','action','question')),
  text text not null,
  assignee uuid, due_on date, agenda_item integer,
  created_at timestamptz not null default now(), edited_at timestamptz
);
create index if not exists kp_meeting_notes_m_idx on public.kp_meeting_notes(meeting_id, created_at);
drop trigger if exists kp_meetings_touch on public.kp_meetings;
create trigger kp_meetings_touch before update on public.kp_meetings for each row execute function public.kp_touch_updated_at();
alter table public.kp_meetings enable row level security;
alter table public.kp_meeting_notes enable row level security;
drop policy if exists kp_mt_sel on public.kp_meetings; create policy kp_mt_sel on public.kp_meetings for select using (public.kp_is_member());
drop policy if exists kp_mt_ins on public.kp_meetings; create policy kp_mt_ins on public.kp_meetings for insert with check (public.kp_is_member());
drop policy if exists kp_mt_upd on public.kp_meetings; create policy kp_mt_upd on public.kp_meetings for update using (public.kp_is_member());
drop policy if exists kp_mt_del on public.kp_meetings; create policy kp_mt_del on public.kp_meetings for delete using (created_by = auth.uid() or public.kp_is_admin());
drop policy if exists kp_mn_sel on public.kp_meeting_notes; create policy kp_mn_sel on public.kp_meeting_notes for select using (public.kp_is_member());
drop policy if exists kp_mn_ins on public.kp_meeting_notes; create policy kp_mn_ins on public.kp_meeting_notes for insert with check (public.kp_is_member());
drop policy if exists kp_mn_upd on public.kp_meeting_notes; create policy kp_mn_upd on public.kp_meeting_notes for update using (author = auth.uid() or public.kp_is_admin());
drop policy if exists kp_mn_del on public.kp_meeting_notes; create policy kp_mn_del on public.kp_meeting_notes for delete using (author = auth.uid() or public.kp_is_admin());
alter publication supabase_realtime add table public.kp_meetings, public.kp_meeting_notes;
