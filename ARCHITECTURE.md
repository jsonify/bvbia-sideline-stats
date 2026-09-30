# Sideline Stats — architecture

Vite + React + TS PWA, mobile-first (parents use phones on the sideline, often with poor signal).
Cloud: Supabase (Postgres + anonymous auth + realtime). Local-first: IndexedDB cache + offline write queue.
Stack decisions are final; do not add new frameworks (no Tailwind/UI kits/state libs) without strong need.

Model: append-only `StatEvent`s (see src/types.ts). One tap = one event. Undo = soft delete.
All UI talks to `Repository` (src/data/repository.ts) via `useRepo()`; all numbers come from `summarize()` (src/lib/summary.ts).
If VITE_SUPABASE_URL is unset the app runs fully on local storage (demo mode) with same interface.

Routes: / games list · /welcome onboarding · /games/new,/games/:id/edit · /games/:id/track (live) · /games/:id summary · /season
Ownership (avoid editing others' files): data/*, supabase/* | features/tracker/* | features/games/*, App shell, PWA | features/stats/* | ui/*, docs, e2e tests
