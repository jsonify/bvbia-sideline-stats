-- Split tracking between phones. Run in the Supabase SQL Editor after 0004_tracker_name.sql.
--
-- Until now one phone tracked a whole game. A game now has two lanes, 'defense' and 'offense', and each lane has its own
-- tracker, so two parents can watch the field at once (one phone can still hold both lanes and track everything).
-- Which stats belong to which lane is decided in the app (src/lib/lanes.ts), not here.
--
-- Same rules as before, applied per lane: a lane is a lease, not a lock. The phone that holds it checks in every ~15 s;
-- after 120 s of silence any team member can take it, and anyone can take it on purpose. stat_events are still never
-- rejected, so taps a parent made offline are merged when their phone reconnects.
--
-- Leases only last minutes, so existing ones are cleared rather than guessing what a whole-game lease should become.
-- The old get/claim/release_game_tracker functions are dropped: phones that still run the previous version of the app
-- fall back to "anyone can tap" until they reload, exactly as they do when the tracker migrations have not been run.

delete from public.game_trackers;

alter table public.game_trackers drop constraint game_trackers_pkey;
alter table public.game_trackers add column lane text not null check (lane in ('defense', 'offense'));
alter table public.game_trackers add primary key (game_id, lane);

drop function if exists public.get_game_tracker(uuid);
drop function if exists public.claim_game_tracker(uuid, boolean, text);
drop function if exists public.release_game_tracker(uuid);

-- Both lanes of a game, from the caller's point of view. 'none' also covers a lease that ran out, and a lane that
-- nobody has ever claimed (so the answer always has exactly two rows).
create or replace function public.get_game_lanes(game uuid)
returns table (lane text, holder text, idle_seconds integer, name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select team_id into tid from public.games where id = game;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  return query
    select l.lane,
           (case
              when t.user_id is null then 'none'
              when t.user_id = auth.uid() then 'me'                          -- still yours until someone else takes it
              when t.seen_at < now() - interval '120 seconds' then 'none'    -- their lease ran out
              else 'other'
            end)::text,
           (case when t.user_id is null then null
                 else greatest(0, extract(epoch from now() - t.seen_at))::integer end),
           (case when t.user_id is null then null else t.tracker_name end)
      from (values ('defense'), ('offense')) as l(lane)
      left join public.game_trackers t on t.game_id = game and t.lane = l.lane
     order by l.lane;
end $$;

-- Start tracking the lanes in `wanted`, or renew your lease on them (the app calls this every ~15 s while tracking).
-- Each lane succeeds when it is free, already yours, or its holder's lease ran out, or when take_over is true.
-- Every lane is one atomic statement, so two parents starting at the same instant can't both win the same lane.
-- Lanes someone else holds are left alone: the answer says who ended up with what.
create or replace function public.claim_game_lanes(game uuid, wanted text[], take_over boolean default false, display_name text default null)
returns table (lane text, holder text, idle_seconds integer, name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  tid uuid;
  l text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select team_id into tid from public.games where id = game and deleted_at is null;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  foreach l in array coalesce(wanted, '{}') loop
    if l not in ('defense', 'offense') then raise exception 'unknown lane %', l; end if;
    insert into public.game_trackers as gt (game_id, lane, team_id, user_id, tracker_name, claimed_at, seen_at)
    values (game, l, tid, auth.uid(), nullif(left(trim(display_name), 30), ''), now(), now())
    on conflict (game_id, lane) do update
      set user_id = auth.uid(),
          tracker_name = excluded.tracker_name,
          claimed_at = case when gt.user_id = auth.uid() then gt.claimed_at else now() end,
          seen_at = now()
    where take_over
       or gt.user_id is null
       or gt.user_id = auth.uid()
       or gt.seen_at < now() - interval '120 seconds';
  end loop;

  return query select * from public.get_game_lanes(game);
end $$;

-- Hand lanes back so another parent can start straight away. Only releases your own leases; `lanes` null means all of them.
create or replace function public.release_game_lanes(game uuid, lanes text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.game_trackers set user_id = null, tracker_name = null, seen_at = now()
   where game_id = game and user_id = auth.uid() and (lanes is null or lane = any(lanes));
end $$;

revoke all on function public.get_game_lanes(uuid), public.claim_game_lanes(uuid, text[], boolean, text), public.release_game_lanes(uuid, text[]) from public, anon;
grant execute on function public.get_game_lanes(uuid), public.claim_game_lanes(uuid, text[], boolean, text), public.release_game_lanes(uuid, text[]) to authenticated;
