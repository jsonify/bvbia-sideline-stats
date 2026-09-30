# Sideline Stats

A mobile-first web app for soccer parent volunteers to track **team** stats live from the sideline. One tap records one event; the app turns them into simple percentages the coach can act on.

Three stats, tracked for the whole team (not individual players):

| Stat | Taps | Summary |
|---|---|---|
| **Duels** (defensive 1v1s) | Won / Lost | Duel win % |
| **First contact** | Clean / Miss, tagged Through ball or Long ball | Clean-touch % (overall and per ball type) |
| **Box entries** | Shot / No shot | % of entries that produced a shot |

Mistaps are safe: every tap can be undone. Several parents can track the same game at once and their taps merge.

## Quickstart (no accounts, no backend)

```bash
npm install
npm run dev
```

Open the printed URL (use your browser's mobile emulation, or your phone on the same network). With no environment variables set the app runs in **demo mode**: everything is stored locally in your browser (IndexedDB), so you can create a team, add a game, track it and view the season page immediately.

Other commands:

```bash
npm run build       # typecheck + production build (with PWA service worker)
npm run preview     # serve the production build
npm test            # unit tests (vitest)
npx playwright test # end-to-end tests on a mobile viewport (see e2e/)
```

## How cloud sync works

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (copy `.env.example` to `.env`) and the app switches from local-only to cloud mode:

- **Anonymous sign-in**: no passwords. The first volunteer creates a team and gets a short **join code**; other parents enter the code (or open a shared link) to see and add to the same games.
- **Append-only events**: each tap is an immutable event; "undo" is a soft delete. That makes merging taps from several phones conflict-free.
- **Offline-first**: events are written to a local IndexedDB cache and an outbox first, then pushed to Supabase when there is signal. Realtime subscriptions keep other phones up to date.

Schema, row-level security and setup steps are in [docs/BACKEND.md](docs/BACKEND.md) and `supabase/migrations/`.

## Deploy in 5 steps (Vercel or Netlify)

1. Create a free Supabase project and run the SQL in `supabase/migrations/` (see [docs/BACKEND.md](docs/BACKEND.md)). Enable **Anonymous sign-ins** under Authentication.
2. Push this repo to GitHub.
3. Import it in Vercel (or Netlify). Framework preset: **Vite**. Build command `npm run build`, output `dist`. `vercel.json` already contains the SPA rewrites.
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy, open the URL on your phone and use **Add to Home Screen** to install it.

More detail (Netlify redirects, custom domain, troubleshooting) in [docs/DEPLOY.md](docs/DEPLOY.md).

## Project layout

```
src/ui/              design system (base.css tokens + Button, Card, Chip, Segmented, Toast, ...)
src/data/            repository (local + Supabase), sync
src/features/        games, tracker, stats, shell
src/lib/summary.ts   the single source of truth for all percentages
e2e/                 Playwright tests (screenshots land in e2e/screenshots)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions.
