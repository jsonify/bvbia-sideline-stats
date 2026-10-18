-- A game's score. Run in the Supabase SQL Editor after 0008_event_zones.sql.
--
-- Anyone on the team can enter the score on a game's summary page (never on the tracker). The season page uses it to
-- show the record and how the stats line up with goals scored, goals conceded, wins and losses.
-- Both columns are null until a score is entered. Without this migration games still sync, just without their score
-- (the app retries without it and keeps the score on the phone that entered it).
alter table public.games add column if not exists score_us smallint;
alter table public.games add column if not exists score_them smallint;

alter table public.games drop constraint if exists games_score_check;
alter table public.games add constraint games_score_check check (
  (score_us is null and score_them is null) or
  (score_us between 0 and 99 and score_them between 0 and 99)
);

-- PostgREST caches the table's columns; tell it about the new ones now rather than on its next reload.
notify pgrst, 'reload schema';
