-- Show who is tracking. Run after 0003_game_tracker.sql.
-- Each phone has an optional "your name" (Settings); it is sent with every check-in and kept on the lease row,
-- so other parents' screens can say "Sam is tracking" instead of "Another parent".

alter table public.game_trackers add column if not exists tracker_name text;

-- Return types / arguments change, so the old versions have to go first.
drop function if exists public.get_game_tracker(uuid);
drop function if exists public.claim_game_tracker(uuid, boolean);

create or replace function public.get_game_tracker(game uuid)
returns table (holder text, idle_seconds integer, name text)
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
    return query select 'none'::text, null::integer, null::text;
    return;
  end if;
  return query select
    (case
       when t.user_id = auth.uid() then 'me'
       when t.seen_at < now() - interval '120 seconds' then 'none'
       else 'other'
     end)::text,
    greatest(0, extract(epoch from now() - t.seen_at))::integer,
    t.tracker_name;
end $$;

create or replace function public.claim_game_tracker(game uuid, take_over boolean default false, display_name text default null)
returns table (holder text, idle_seconds integer, name text)
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select team_id into tid from public.games where id = game and deleted_at is null;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  insert into public.game_trackers as gt (game_id, team_id, user_id, tracker_name, claimed_at, seen_at)
  values (game, tid, auth.uid(), nullif(left(trim(display_name), 30), ''), now(), now())
  on conflict (game_id) do update
    set user_id = auth.uid(),
        tracker_name = excluded.tracker_name,
        claimed_at = case when gt.user_id = auth.uid() then gt.claimed_at else now() end,
        seen_at = now()
  where take_over
     or gt.user_id is null
     or gt.user_id = auth.uid()
     or gt.seen_at < now() - interval '120 seconds';

  return query select * from public.get_game_tracker(game);
end $$;

revoke all on function public.get_game_tracker(uuid), public.claim_game_tracker(uuid, boolean, text) from public, anon;
grant execute on function public.get_game_tracker(uuid), public.claim_game_tracker(uuid, boolean, text) to authenticated;
