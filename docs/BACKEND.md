# Backend setup (Supabase)

The app runs without any backend (demo mode: data stays in this browser's IndexedDB). To share stats between parents, set up Supabase once:

1. **Create a project** at supabase.com (free tier is fine).
2. **Enable anonymous sign-ins**: Authentication > Sign In / Providers > *Allow anonymous sign-ins* = on. (Parents never make accounts; they just enter a team join code.)
3. **Run the SQL**: SQL Editor > paste `supabase/migrations/0001_init.sql` > Run. Creates tables, row-level security, `create_team` / `join_team` RPCs and enables realtime on `games` and `stat_events`.
4. **Env vars** (Project Settings > API): create `.env.local` locally, and add the same in Vercel/Netlify:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```
5. **Deploy**: import the repo in Vercel or Netlify (build `npm run build`, output `dist`), set the env vars, deploy. Add an SPA fallback (Vercel: `vercel.json` rewrite to `/index.html`; Netlify: `_redirects` `/* /index.html 200`).

## How it works
- Coach/first parent taps "Create team" and gets a 6-character join code; other parents "Join team" with it. Each device gets an anonymous Supabase user; RLS limits every row to teams the user is a member of.
- Every write goes to IndexedDB first, then into a persistent queue that upserts to Supabase (client-generated UUIDs, so retries are idempotent), with exponential backoff (1s to 60s) and an automatic flush on reconnect. Undo is a soft delete (`deleted_at`).
- Realtime subscriptions on `games` and `stat_events` trigger a merge-pull into the local cache so parents watching a game see the tracker's taps as they happen.
- Caveat: an anonymous identity lives in the browser. Clearing site data loses membership; re-join with the code (data is safe in the cloud).

## Team branding — `0002_branding.sql` is no longer needed

The app's look is fixed: BVB yellow accent and the BVB crest (`public/bvb-crest.png`). There is no "Team look" screen any more,
so the UI ignores any `branding` saved on a team. You can skip `0002_branding.sql` (the app reads teams with `select *` and
tolerates the column being absent); if you already ran it, leave it in place. It is harmless, and any look saved earlier is simply ignored.

## One tracker per game — run `0003_game_tracker.sql`

After `0001_init.sql`, open **SQL Editor → New query**, paste `supabase/migrations/0003_game_tracker.sql` and **Run**.
It adds a `game_trackers` table (one row per game: who is tracking and when they last checked in) and three functions the app calls:

| Function | What it does |
|---|---|
| `claim_game_tracker(game, take_over)` | Start tracking, or renew your lease (the app calls it every ~15 s). Succeeds if the game is free, already yours, or the holder has been silent for 120 s, or if `take_over` is true. One atomic statement, so two parents starting at the same instant cannot both win. |
| `release_game_tracker(game)` | Hand the game back. Only ever releases your own lease. |
| `get_game_tracker(game)` | `me` / `other` / `none` plus seconds since the holder last checked in (computed on the server, so phone clocks don't matter). |

The table has read-only row-level security for team members; all changes go through those functions. It is added to the realtime publication so a takeover or hand-off shows on other phones immediately (on its own channel, so a missing migration cannot affect live stats).

**It coordinates, it does not gate.** `stat_events` are never rejected by the lease: an offline phone's queued taps must still be accepted after someone else took over, or those taps would be lost. If you deploy the app before running this migration, the tracking calls fail and the app falls back to "anyone can tap" (the previous behaviour).

To change the 2-minute timeout, edit both `interval '120 seconds'` occurrences in the migration (the functions are `create or replace`, so re-running is safe; skip the `create table` and `alter publication` lines).

## Who is tracking — run `0004_tracker_name.sql`

After `0003`, run `supabase/migrations/0004_tracker_name.sql`. It adds a `tracker_name` column and replaces `get_game_tracker` / `claim_game_tracker` so they carry an optional name (trimmed, max 30 characters). The name is set per phone in **Settings → Your name**, sent with each check-in and shown to other parents ("Sam is tracking this game"). Without `0004` the tracking calls fail and the app falls back to "anyone can tap", so run it right after `0003`.
