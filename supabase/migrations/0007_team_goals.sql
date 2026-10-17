-- Coach's targets for each stat (e.g. "win 60% of 1v1s"), shared by every member of the team.
-- Run this in the Supabase SQL Editor after 0006_game_thanks.sql. Without it, targets just can't be saved; nothing else is affected.
alter table public.teams add column if not exists goals jsonb not null default '{}'::jsonb;

create or replace function public.set_team_goals(team uuid, g jsonb)
returns public.teams language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
  k text;
  clean jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_team_member(team) then raise exception 'not a member of this team'; end if;
  if jsonb_typeof(g) <> 'object' then raise exception 'invalid goals'; end if;
  -- Only the three stats, each a whole percentage from 1 to 100. Anything else is dropped.
  foreach k in array array['duel', 'first_contact', 'box_entry'] loop
    if jsonb_typeof(g->k) = 'number' and (g->>k)::numeric between 1 and 100 then
      clean := clean || jsonb_build_object(k, round((g->>k)::numeric)::int);
    end if;
  end loop;
  update public.teams set goals = clean where id = team returning * into t;
  return t;
end $$;

revoke all on function public.set_team_goals(uuid, jsonb) from public, anon;
grant execute on function public.set_team_goals(uuid, jsonb) to authenticated;
-- Let other phones pick up new targets live. 0002 did this too, but it is optional, so only add the table if it isn't there.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams') then
    alter publication supabase_realtime add table public.teams;
  end if;
end $$;
