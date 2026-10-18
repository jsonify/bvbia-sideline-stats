-- Kick-off times, so a season's games can be entered ahead of time. Run in the Supabase SQL Editor after 0010_game_clock.sql.
--
-- kickoff: the game's start time (local, no time zone: it is whatever the schedule says), null until set.
-- Without this migration games still sync, just without it (the app retries without it and keeps it on the phone that set it).
alter table public.games add column if not exists kickoff time;

-- PostgREST caches the table's columns; tell it about the new one now rather than on its next reload.
notify pgrst, 'reload schema';
