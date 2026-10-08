-- Conversations privées (canaux réservés à leurs participants) et mentions @Prénom
-- Appliquée le 2026-10-08 sur le projet MotoCam (opbxmnrtbzsxgwtfeemv)

alter table public.kp_channels add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.kp_messages add column if not exists mentions uuid[] not null default '{}';

create table if not exists public.kp_channel_members (
  channel_id uuid not null references public.kp_channels(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_by   uuid,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.kp_channel_members enable row level security;

-- Un canal est visible s'il est d'équipe (general/projet) ou si l'utilisateur en est participant
create or replace function public.kp_can_see_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.kp_channels c
    where c.id = cid
      and (c.kind <> 'prive' or exists (select 1 from public.kp_channel_members m where m.channel_id = cid and m.user_id = auth.uid()))
  );
$$;

drop policy if exists kp_channels_sel on public.kp_channels;
create policy kp_channels_sel on public.kp_channels for select to authenticated
  using (public.kp_is_member() and public.kp_can_see_channel(id));

drop policy if exists kp_messages_sel on public.kp_messages;
create policy kp_messages_sel on public.kp_messages for select to authenticated
  using (public.kp_is_member() and public.kp_can_see_channel(channel_id));

drop policy if exists kp_messages_ins on public.kp_messages;
create policy kp_messages_ins on public.kp_messages for insert to authenticated
  with check (public.kp_is_member() and author = auth.uid() and public.kp_can_see_channel(channel_id));

drop policy if exists kp_channel_members_sel on public.kp_channel_members;
create policy kp_channel_members_sel on public.kp_channel_members for select to authenticated
  using (public.kp_is_member() and public.kp_can_see_channel(channel_id));

-- Création d'une conversation privée (réutilise une conversation existante avec exactement les mêmes participants)
create or replace function public.kp_create_private_channel(others uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ids uuid[]; cid uuid;
begin
  if me is null or not public.kp_is_member() then raise exception 'forbidden'; end if;
  select array_agg(distinct u order by u) into ids
    from unnest(coalesce(others, '{}'::uuid[]) || me) u
    where exists (select 1 from public.kp_members where user_id = u);
  if coalesce(array_length(ids, 1), 0) < 2 then raise exception 'need_other'; end if;
  select c.id into cid from public.kp_channels c
    where c.kind = 'prive'
      and (select array_agg(m.user_id order by m.user_id) from public.kp_channel_members m where m.channel_id = c.id) = ids
    limit 1;
  if cid is not null then return cid; end if;
  insert into public.kp_channels(name, kind, sort, created_by) values ('', 'prive', 100, me) returning id into cid;
  insert into public.kp_channel_members(channel_id, user_id, added_by) select cid, u, me from unnest(ids) u;
  return cid;
end $$;
revoke all on function public.kp_create_private_channel(uuid[]) from public;
grant execute on function public.kp_create_private_channel(uuid[]) to authenticated;

-- Temps réel : une nouvelle conversation apparaît chez ses participants sans recharger
alter publication supabase_realtime add table public.kp_channels, public.kp_channel_members;
