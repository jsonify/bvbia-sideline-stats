-- Thank the trackers with a heart. Run in the Supabase SQL Editor after 0005_tracker_lanes.sql.
--
-- Tracking is quiet work done by one or two parents. Any team member can give a game (live or finished) one heart to say
-- thanks, and take it back. One heart per parent per game. It is only an acknowledgement: it never touches stat_events,
-- so the numbers on the summary are exactly what they were.
--
-- Taking a heart back is a soft delete (deleted_at), like undoing a tap, so the change reaches other phones over realtime.
-- (Realtime cannot filter hard DELETEs by team, and soft deletes are how the rest of the app removes things anyway.)
--
-- The app works without this migration: the heart just doesn't save, and games and stats are not affected.

create table public.game_thanks (
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, -- denormalised for RLS/realtime filter
  user_id uuid not null,
  name text,                                                            -- the parent's "your name" when they gave it
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                                               -- set when the heart is taken back
  primary key (game_id, user_id)
);
create index on public.game_thanks (team_id);

alter table public.game_thanks enable row level security;
create policy "members read thanks" on public.game_thanks for select using (public.is_team_member(team_id));
-- No insert/update/delete policies: clients only change this table through the function below.

-- Give or take back your heart on a game. Giving needs a game that has started (live or final);
-- taking back always works. Safe to repeat: giving twice keeps the first time, taking back twice does nothing.
create or replace function public.set_game_thanks(game uuid, given boolean, display_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  st text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select team_id, status into tid, st from public.games where id = game and deleted_at is null;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  if given then
    if st not in ('live', 'final') then raise exception 'game has not started'; end if;
    insert into public.game_thanks as gt (game_id, team_id, user_id, name, created_at, deleted_at)
    values (game, tid, auth.uid(), nullif(left(trim(display_name), 30), ''), now(), null)
    on conflict (game_id, user_id) do update
      set name = excluded.name,
          created_at = case when gt.deleted_at is null then gt.created_at else now() end,
          deleted_at = null;
  else
    update public.game_thanks set deleted_at = now()
     where game_id = game and user_id = auth.uid() and deleted_at is null;
  end if;
end $$;

revoke all on function public.set_game_thanks(uuid, boolean, text) from public, anon;
grant execute on function public.set_game_thanks(uuid, boolean, text) to authenticated;

-- Let other phones (the tracker's, above all) see a heart as soon as it is given.
alter publication supabase_realtime add table public.game_thanks;
