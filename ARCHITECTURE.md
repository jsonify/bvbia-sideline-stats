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
Ownership (avoid editing others' files): data/*, supabase/* | features/tracker/* | features/games/*, App shell, PWA | features/stats/* | ui/*, docs, e2e tests
