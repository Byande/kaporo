-- Appliquée le 2026-10-08 (Supabase MotoCam) — Module Suivi : enrichissement des tâches et phases
alter table public.kp_tasks
  add column if not exists description text,
  add column if not exists priority text not null default 'normale',
  add column if not exists phase_id uuid references public.kp_phases(id) on delete set null,
  add column if not exists start_on date,
  add column if not exists progress integer not null default 0,
  add column if not exists sort numeric not null default 0,
  add column if not exists tags text[] not null default '{}',
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists comments jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
alter table public.kp_tasks drop constraint if exists kp_tasks_priority_chk;
alter table public.kp_tasks add constraint kp_tasks_priority_chk check (priority in ('basse','normale','haute','urgente'));
alter table public.kp_tasks drop constraint if exists kp_tasks_status_chk;
alter table public.kp_tasks add constraint kp_tasks_status_chk check (status in ('à faire','en cours','en attente','fait'));
alter table public.kp_tasks drop constraint if exists kp_tasks_progress_chk;
alter table public.kp_tasks add constraint kp_tasks_progress_chk check (progress between 0 and 100);
create index if not exists kp_tasks_phase_idx on public.kp_tasks(phase_id);
create index if not exists kp_tasks_due_idx on public.kp_tasks(due_on);
update public.kp_tasks set sort = extract(epoch from created_at) where sort = 0;
create or replace function public.kp_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists kp_tasks_touch on public.kp_tasks;
create trigger kp_tasks_touch before update on public.kp_tasks for each row execute function public.kp_touch_updated_at();
alter table public.kp_phases
  add column if not exists progress integer not null default 0,
  add column if not exists owner uuid;
alter table public.kp_phases drop constraint if exists kp_phases_progress_chk;
alter table public.kp_phases add constraint kp_phases_progress_chk check (progress between 0 and 100);
