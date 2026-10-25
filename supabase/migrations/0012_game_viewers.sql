-- Who's watching: how many parents have a live game open right now, and how many followed it. Run in the Supabase SQL
-- Editor after 0011_game_kickoff.sql.
--
-- Every phone with a live game open (its summary or its tracker) checks in every ~20 s with watch_game(game, true).
-- "Watching now" is everyone who checked in within the last 60 s; "followed" is everyone who ever checked in while the
-- game was live. A finished game asks with here = false, which only reads the count. One row per parent per game.
-- It never touches stat_events.
--
-- The app works without this migration: the count just doesn't show, and games and stats are not affected.

create table public.game_viewers (
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, -- denormalised for RLS
  user_id uuid not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index on public.game_viewers (team_id);

alter table public.game_viewers enable row level security;
-- No policies: clients only read and write this table through the function below.

create or replace function public.watch_game(game uuid, here boolean default true)
returns table (watching integer, followed integer) language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  st text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select g.team_id, g.status into tid, st from public.games g where g.id = game and g.deleted_at is null;
  if tid is null or not public.is_team_member(tid) then raise exception 'game not found'; end if;

  if here and st = 'live' then
    insert into public.game_viewers as gv (game_id, team_id, user_id) values (game, tid, auth.uid())
    on conflict (game_id, user_id) do update set last_seen = now();
  end if;

  return query
    select (case when st = 'live' then count(*) filter (where v.last_seen > now() - interval '60 seconds') else 0 end)::integer,
           count(*)::integer
      from public.game_viewers v where v.game_id = game;
end $$;

revoke all on function public.watch_game(uuid, boolean) from public, anon;
grant execute on function public.watch_game(uuid, boolean) to authenticated;
