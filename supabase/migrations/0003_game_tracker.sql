-- One tracker per game. Run in the Supabase SQL Editor after 0001_init.sql.
--
-- Two parents tapping the same game would double-count every play, so only one phone tracks a game at a time.
-- It is a lease, not a lock: the tracking phone checks in every ~15 s, and if it goes quiet for 2 minutes
-- (dead battery, no signal, app closed) any team member can start tracking. Anyone can also take over on purpose.
--
-- This table only decides who the app lets tap. stat_events are never rejected, so taps a parent made offline
-- are still merged when their phone reconnects, even if someone took over in the meantime.
--
-- The app works without this migration (it just falls back to "anyone can tap"), so it is safe to deploy first.

create table public.game_trackers (
  game_id uuid primary key references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, -- denormalised for RLS/realtime filter
  user_id uuid,                                                         -- null = handed back, nobody tracking
  claimed_at timestamptz not null default now(),
  seen_at timestamptz not null default now()                            -- last check-in from the tracker
);
create index on public.game_trackers (team_id);

alter table public.game_trackers enable row level security;
create policy "members read trackers" on public.game_trackers for select using (public.is_team_member(team_id));
-- No insert/update/delete policies: clients only change this table through the functions below.

-- Who holds the game, from the caller's point of view. 'none' also covers a lease that ran out.
create or replace function public.get_game_tracker(game uuid)
returns table (holder text, idle_seconds integer)
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  t public.game_trackers;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select team_id into tid from public.games where id = game;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  select * into t from public.game_trackers where game_id = game;
  if not found or t.user_id is null then
    return query select 'none'::text, null::integer;
    return;
  end if;
  return query select
    (case
       when t.user_id = auth.uid() then 'me'                          -- still yours until someone else takes it
       when t.seen_at < now() - interval '120 seconds' then 'none'    -- their lease ran out
       else 'other'
     end)::text,
    greatest(0, extract(epoch from now() - t.seen_at))::integer;
end $$;

-- Start tracking, or renew your lease (the app calls this every ~15 s while tracking).
-- Succeeds when the game is free, already yours, or the holder's lease ran out, or when take_over is true.
-- A single atomic statement, so two parents starting at the same instant can't both win.
create or replace function public.claim_game_tracker(game uuid, take_over boolean default false)
returns table (holder text, idle_seconds integer)
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select team_id into tid from public.games where id = game and deleted_at is null;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  insert into public.game_trackers as gt (game_id, team_id, user_id, claimed_at, seen_at)
  values (game, tid, auth.uid(), now(), now())
  on conflict (game_id) do update
    set user_id = auth.uid(),
        claimed_at = case when gt.user_id = auth.uid() then gt.claimed_at else now() end,
        seen_at = now()
  where take_over
     or gt.user_id is null
     or gt.user_id = auth.uid()
     or gt.seen_at < now() - interval '120 seconds';

  return query select * from public.get_game_tracker(game);
end $$;

-- Hand the game back so another parent can start straight away. Only releases your own lease.
create or replace function public.release_game_tracker(game uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.game_trackers set user_id = null, seen_at = now()
   where game_id = game and user_id = auth.uid();
end $$;

revoke all on function public.get_game_tracker(uuid), public.claim_game_tracker(uuid, boolean), public.release_game_tracker(uuid) from public, anon;
grant execute on function public.get_game_tracker(uuid), public.claim_game_tracker(uuid, boolean), public.release_game_tracker(uuid) to authenticated;

-- Let other phones see a takeover or hand-off straight away.
alter publication supabase_realtime add table public.game_trackers;
