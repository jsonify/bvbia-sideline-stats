# Sideline Stats

A mobile-first web app for soccer parent volunteers to track **team** stats live from the sideline. One tap records one event; the app turns them into simple percentages the coach can act on.

Three stats, tracked for the whole team (not individual players):

| Stat | Taps | Summary |
|---|---|---|
| **Duels** (defensive 1v1s) | Won / Lost | Duel win % |
| **First contact** | Clean / Miss, tagged Through ball or Long ball | Clean-touch % (overall and per ball type) |
| **Box entries** | Shot / No shot | % of entries that produced a shot |

Mistaps are safe: every tap can be undone. **One parent tracks a game at a time** so the same play is never counted twice. Everyone else on the team can open the live game and watch the numbers update, and can take over if the tracker hands off or goes quiet (see [Tracking a game with several parents](#tracking-a-game-with-several-parents)).

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

- **Anonymous sign-in**: no passwords. The first volunteer creates a team and gets a short **join code**. **Share code** sends other parents a message with the app link, the code and three steps to join. Opening the link lands on the join screen with the code already filled in; they can also paste the code by hand.
- **Append-only events**: each tap is an immutable event; "undo" is a soft delete. That makes merging taps from several phones conflict-free.
- **Offline-first**: events are written to a local IndexedDB cache and an outbox first, then pushed to Supabase when there is signal. Realtime subscriptions keep other phones up to date.

### Tracking a game with several parents

Only one phone tracks a game at a time; it holds a short **lease** on the game.

| Situation | What happens |
|---|---|
| Open a live game nobody is tracking | You become the tracker and can tap. |
| Open a game someone else is tracking | You watch live (buttons off, numbers update as they tap). A banner shows they are active and offers **Take over tracking**, which asks you to confirm because it switches them to watching. |
| The tracker leaves the screen, ends the game or taps back | The lease is released at once; watchers get **Start tracking** straight away, with no confirmation. |
| The tracker's phone dies, loses signal or closes the app | Their phone checks in every 15 s. After 2 minutes of silence the game counts as free and anyone can start tracking. |
| Someone takes over | The old tracker's screen switches to watching within a moment ("Another parent took over tracking"). Everything they tapped is kept. |
| No signal when you open the game | You are never blocked: after a few seconds the app assumes you are the tracker and carries on. If it later finds someone else was already tracking, you switch to watching. |

The lease only decides who the app lets tap; it never rejects stats. Taps recorded on a phone with no signal are still merged when it reconnects, even if someone took over meanwhile, so nothing is lost (worst case, a play is counted twice and can be undone). It needs the `0003_game_tracker.sql` migration; without it the app quietly falls back to letting anyone tap. In demo mode (one device) you are always the tracker.

Schema, row-level security and setup steps are in [docs/BACKEND.md](docs/BACKEND.md) and `supabase/migrations/`.

## Deploy in 5 steps (Vercel or Netlify)

1. Create a free Supabase project and run the SQL in `supabase/migrations/`, in order (`0001` to `0003`; see [docs/BACKEND.md](docs/BACKEND.md)). Enable **Anonymous sign-ins** under Authentication.
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
