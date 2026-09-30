# Sideline Stats — architecture

Vite + React + TS PWA, mobile-first (parents use phones on the sideline, often with poor signal).
Cloud: Supabase (Postgres + anonymous auth + realtime). Local-first: IndexedDB cache + offline write queue.
Stack decisions are final; do not add new frameworks (no Tailwind/UI kits/state libs) without strong need.

Model: append-only `StatEvent`s (see src/types.ts). One tap = one event. Undo = soft delete.
All UI talks to `Repository` (src/data/repository.ts) via `useRepo()`; all numbers come from `summarize()` (src/lib/summary.ts).
If VITE_SUPABASE_URL is unset the app runs fully on local storage (demo mode) with same interface.

Routes: / games list · /welcome onboarding (`?code=ABC234` from an invite link opens the join step pre-filled) · /games/new,/games/:id/edit · /games/:id/track (live) · /games/:id summary · /season
One tracker per game: a server-side lease (`claim/release/get_game_tracker`, 120 s, renewed every 15 s). It only gates the tracker UI; events are never rejected (offline taps must not be lost), and any failure to reach the server means "assume you're the tracker".
Ownership (avoid editing others' files): data/*, supabase/* | features/tracker/* | features/games/*, App shell, PWA | features/stats/* | ui/*, docs, e2e tests
