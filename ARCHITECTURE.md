# Sideline Stats — architecture

Vite + React + TS PWA, mobile-first (parents use phones on the sideline, often with poor signal).
Cloud: Supabase (Postgres + anonymous auth + realtime). Local-first: IndexedDB cache + offline write queue.
Stack decisions are final; do not add new frameworks (no Tailwind/UI kits/state libs) without strong need.

Model: append-only `StatEvent`s (see src/types.ts). One tap = one event. Undo = soft delete.
All UI talks to `Repository` (src/data/repository.ts) via `useRepo()`; all numbers come from `summarize()` (src/lib/summary.ts).
If VITE_SUPABASE_URL is unset the app runs fully on local storage (demo mode) with same interface.

Routes: / games list · /welcome onboarding (`?code=ABC234` from an invite link opens the join step pre-filled) · /games/new,/games/:id/edit · /games/:id/track (live) · /games/:id summary · /season
One tracker per lane: a game has two lanes, defense (1v1s, first contact) and offense (box entries), each with a server-side lease (`claim/release/get_game_lanes`, 120 s, renewed every 15 s). A phone holds both lanes (tracks everything, the default for someone on their own) or the phones split them. Which stat belongs to which lane is one map, `LANE_OF` in src/lib/lanes.ts. The leases only gate the tracker UI; events are never rejected (offline taps must not be lost), and any failure to reach the server means "assume you hold the lanes". Each phone has its own half (1st/2nd) switch; it starts in, and follows, the half other phones are recording in.
Thanks (a ♥ on a live or final game, one per parent): `listThanks/setThanks` on the Repository, cached in kv `thanks:<teamId>`. Deliberately NOT in the write queue or `pull()`: a heart that can't be sent must never block or error stat sync, so it is shown at once, sent directly, and undone on screen if the send fails (`set_game_thanks` RPC, `game_thanks` table, own realtime channel). It is never read by `summarize()`.
Stat guide (the ⓘ next to each stat): `features/guide`, a sheet drawn over the current page, never a route, because leaving the tracker screen releases the tracker's lanes. Words are data in `topics.ts`, pictures are inline SVG in `Scene.tsx` using only theme tokens (light/dark/any accent). `InfoButton` owns its sheet, so a page just drops one beside a stat's name.
Targets: `Team.goals` (whole % per stat, `cleanGoals`/`goalStatus` in src/lib/goals.ts), saved with `saveGoals` (`set_team_goals` RPC, `teams.goals`), refreshed like branding. Display only, never read by `summarize()`.
Score: `Game.score` ({us, them}, `cleanScore`/`resultOf` in src/lib/score.ts), set only from the game summary's `ScoreCard` so the tracker never changes. Season analysis by result (record, stats in wins/draws/losses, record vs targets) is pure helpers in features/stats/results.ts. Never read by `summarize()`. Synced as `games.score_us/score_them`; a server without them gets the game without its score, and `pull()` keeps a phone's score when the server sends none.
Trends: pure helpers in features/stats/trends.ts (pooled recent form, rolling average, by-opponent grouping keyed by `opponentKey`). Halftime numbers: `HalftimeSheet` (features/stats), a sheet on the tracker for the same reason as the stat guide. Share image: features/stats/shareCard.ts draws a PNG on a canvas (fixed light palette, no library), `ShareImage` previews it and hands it to `navigator.share({ files })` or a download.
Ownership (avoid editing others' files): data/*, supabase/* | features/tracker/* | features/games/*, App shell, PWA | features/stats/* | ui/*, docs, e2e tests
