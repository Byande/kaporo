-- Appliquée le 2026-10-08 (Supabase MotoCam) — Modules Rédaction collaborative et Budget
-- Rédaction : documents texte co-édités (état CRDT Yjs en base64) + versions
create table if not exists public.kp_docs (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.kp_projects(id) on delete set null,
  title text not null,
  category text not null default 'Note',
  content_html text not null default '',
  ystate text,
  created_by uuid, created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  archived boolean not null default false
);
create table if not exists public.kp_doc_versions (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.kp_docs(id) on delete cascade,
  num integer not null,
  label text,
  content_html text not null,
  ystate text,
  author uuid, created_at timestamptz not null default now()
);
create index if not exists kp_doc_versions_doc_idx on public.kp_doc_versions(doc_id, num desc);
alter table public.kp_docs enable row level security;
alter table public.kp_doc_versions enable row level security;
drop policy if exists kp_docs_sel on public.kp_docs; create policy kp_docs_sel on public.kp_docs for select using (public.kp_is_member());
drop policy if exists kp_docs_ins on public.kp_docs; create policy kp_docs_ins on public.kp_docs for insert with check (public.kp_is_member());
drop policy if exists kp_docs_upd on public.kp_docs; create policy kp_docs_upd on public.kp_docs for update using (public.kp_is_member());
drop policy if exists kp_docs_del on public.kp_docs; create policy kp_docs_del on public.kp_docs for delete using (created_by = auth.uid() or public.kp_is_admin());
drop policy if exists kp_docv_sel on public.kp_doc_versions; create policy kp_docv_sel on public.kp_doc_versions for select using (public.kp_is_member());
drop policy if exists kp_docv_ins on public.kp_doc_versions; create policy kp_docv_ins on public.kp_doc_versions for insert with check (public.kp_is_member());
drop policy if exists kp_docv_del on public.kp_doc_versions; create policy kp_docv_del on public.kp_doc_versions for delete using (public.kp_is_admin());

-- Budget : lignes (prévu) et mouvements (engagements, paiements, encaissements) + journal
alter table public.kp_projects add column if not exists gnf_per_eur numeric not null default 9600;
create table if not exists public.kp_budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.kp_projects(id) on delete cascade,
  kind text not null default 'dépense' check (kind in ('dépense','recette')),
  category text not null,
  label text not null,
  planned numeric not null default 0,
  phase_id uuid references public.kp_phases(id) on delete set null,
  supplier text, note text,
  sort numeric not null default 0,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.kp_budget_moves (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.kp_budget_lines(id) on delete cascade,
  type text not null check (type in ('engagement','paiement','encaissement')),
  amount numeric not null,
  on_date date not null default current_date,
  label text, ref text,
  document_id uuid references public.kp_documents(id) on delete set null,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists kp_budget_moves_line_idx on public.kp_budget_moves(line_id);
create table if not exists public.kp_budget_log (
  id bigserial primary key,
  project_id text, line_id uuid, who uuid,
  at timestamptz not null default now(),
  action text not null, detail jsonb
);
create or replace function public.kp_budget_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare pid text; lid uuid; d jsonb;
begin
  if tg_table_name = 'kp_budget_lines' then
    pid := coalesce(new.project_id, old.project_id); lid := coalesce(new.id, old.id);
    d := jsonb_build_object('table','ligne','label', coalesce(new.label, old.label),
      'avant', case when tg_op <> 'INSERT' then jsonb_build_object('planned', old.planned, 'label', old.label, 'category', old.category, 'kind', old.kind) end,
      'apres', case when tg_op <> 'DELETE' then jsonb_build_object('planned', new.planned, 'label', new.label, 'category', new.category, 'kind', new.kind) end);
  else
    lid := coalesce(new.line_id, old.line_id);
    select project_id into pid from public.kp_budget_lines where id = lid;
    d := jsonb_build_object('table','mouvement','type', coalesce(new.type, old.type), 'amount', coalesce(new.amount, old.amount), 'label', coalesce(new.label, old.label), 'on_date', coalesce(new.on_date, old.on_date),
      'avant', case when tg_op = 'UPDATE' then jsonb_build_object('amount', old.amount, 'type', old.type, 'on_date', old.on_date) end);
  end if;
  insert into public.kp_budget_log(project_id, line_id, who, action, detail) values (pid, lid, auth.uid(), lower(tg_op), d);
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'kp_budget_lines' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists kp_budget_lines_audit on public.kp_budget_lines;
create trigger kp_budget_lines_audit before insert or update or delete on public.kp_budget_lines for each row execute function public.kp_budget_audit();
drop trigger if exists kp_budget_moves_audit on public.kp_budget_moves;
create trigger kp_budget_moves_audit before insert or update or delete on public.kp_budget_moves for each row execute function public.kp_budget_audit();
alter table public.kp_budget_lines enable row level security;
alter table public.kp_budget_moves enable row level security;
alter table public.kp_budget_log enable row level security;
drop policy if exists kp_bl_sel on public.kp_budget_lines; create policy kp_bl_sel on public.kp_budget_lines for select using (public.kp_is_member());
drop policy if exists kp_bl_ins on public.kp_budget_lines; create policy kp_bl_ins on public.kp_budget_lines for insert with check (public.kp_is_member());
drop policy if exists kp_bl_upd on public.kp_budget_lines; create policy kp_bl_upd on public.kp_budget_lines for update using (public.kp_is_member());
drop policy if exists kp_bl_del on public.kp_budget_lines; create policy kp_bl_del on public.kp_budget_lines for delete using (public.kp_is_member());
drop policy if exists kp_bm_sel on public.kp_budget_moves; create policy kp_bm_sel on public.kp_budget_moves for select using (public.kp_is_member());
drop policy if exists kp_bm_ins on public.kp_budget_moves; create policy kp_bm_ins on public.kp_budget_moves for insert with check (public.kp_is_member());
drop policy if exists kp_bm_upd on public.kp_budget_moves; create policy kp_bm_upd on public.kp_budget_moves for update using (public.kp_is_member());
drop policy if exists kp_bm_del on public.kp_budget_moves; create policy kp_bm_del on public.kp_budget_moves for delete using (public.kp_is_member());
drop policy if exists kp_blog_sel on public.kp_budget_log; create policy kp_blog_sel on public.kp_budget_log for select using (public.kp_is_member());
alter publication supabase_realtime add table public.kp_docs, public.kp_doc_versions, public.kp_budget_lines, public.kp_budget_moves, public.kp_budget_log;
