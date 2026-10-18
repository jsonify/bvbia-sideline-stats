-- Half lengths and the game clock. Run in the Supabase SQL Editor after 0009_game_score.sql.
--
-- half_minutes: how long each half is (set on the game form; it varies by age group and tournament), e.g. {25,25}.
-- clock: the shared game clock, started and paused from the tracker: one {"ms": played, "since": ISO or null} per half.
-- Both are null until set. Without this migration games still sync, just without them (the app retries without them and
-- keeps them on the phone that set them).
alter table public.games add column if not exists half_minutes smallint[];
alter table public.games add column if not exists clock jsonb;

alter table public.games drop constraint if exists games_half_minutes_check;
alter table public.games add constraint games_half_minutes_check check (
  half_minutes is null or (cardinality(half_minutes) between 1 and 4 and 1 <= all(half_minutes) and 60 >= all(half_minutes))
);

-- PostgREST caches the table's columns; tell it about the new ones now rather than on its next reload.
notify pgrst, 'reload schema';
