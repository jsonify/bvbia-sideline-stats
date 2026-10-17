-- Where on the field a tap happened. Run in the Supabase SQL Editor after 0007_team_goals.sql.
--
-- The tracker can now log a stat by tapping a zone of the field: box entries in one of six zones of the box we attack,
-- 1v1s and first contact in one of six zones of our half. Zones are relative to the goal we attack, so they mean the same
-- thing in both halves. Taps made with the buttons (and every tap from before this) have no zone.
-- Without this migration zoned taps still sync, just without their zone (the app retries without it).
alter table public.stat_events add column if not exists zone text;

alter table public.stat_events drop constraint if exists stat_events_zone_check;
alter table public.stat_events add constraint stat_events_zone_check check (
  zone is null or
  (category = 'box_entry' and zone in ('edge_l', 'edge_c', 'edge_r', 'near_l', 'near_c', 'near_r')) or
  (category in ('duel', 'first_contact') and zone in ('def_l', 'def_c', 'def_r', 'mid_l', 'mid_c', 'mid_r'))
);

-- PostgREST caches the table's columns; tell it about the new one now rather than on its next reload.
notify pgrst, 'reload schema';
