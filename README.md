# Sideline Stats

A mobile-first web app for soccer parent volunteers to track **team** stats live from the sideline. One tap records one event; the app turns them into simple percentages the coach can act on.

Deployed on Vercel as `bvbia-sideline-stats`.

Three stats, tracked for the whole team (not individual players):

| Stat | Taps | Summary |
|---|---|---|
| **Duels** (defensive 1v1s) | Won / Lost | Duel win % |
| **First contact** | Clean / Miss, tagged Through ball or Long ball | Clean-touch % (overall and per ball type) |
| **Box entries** | Shot / No shot | % of entries that produced a shot |

Mistaps are safe: every tap can be undone. **Split the work or do it all:** one parent can track everything, or two parents can each take a side (**Defense** or **Offense**) on their own phones, so there are more eyes on the field. Each stat is tapped by exactly one phone, so a play is never counted twice. Anyone else on the team can open the live game and watch the numbers update (see [Tracking a game with several parents](#tracking-a-game-with-several-parents)).

The game summary includes a **game map**: a line drawing of the field with every tap as a dot (circle = 1v1, diamond = first contact, square = box entry; filled = good outcome). We record what happened, not where, so positions are simulated: 1v1s and first contacts land at random in our half, box entries always inside the attacking box. A toggle narrows the map to the 1st or 2nd half without moving any dot. Each dot's spot comes from its event id, so the picture is the same every time and on every phone.

**Say thanks with a heart.** Tracking is quiet work, so any parent can tap the **♥ Thanks** heart on a game that is live or finished to thank whoever tracked it, and tap again to take it back. One heart per parent per game. The parent tracking sees who thanked them (a small ♥ line under the header, with no button, since they are the one being thanked), and the games list shows a heart count on each game; a game nobody has thanked just shows nothing. Hearts are only an acknowledgement and never touch the stats. A heart is sent straight away rather than queued, so it needs a signal: with none, it un-does itself and says so. It needs the `0006_game_thanks.sql` migration; without it the heart simply doesn't save and nothing else is affected. In demo mode (one device) it works too, on this device only.

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

A game has two **lanes**, and each lane is tracked by one phone at a time:

| Lane | Stats |
|---|---|
| **Defense** | Defensive 1v1s, first contact |
| **Offense** | Box entries |

A phone can hold both lanes (**Everything**, the default) or just one. Pick what you track with the **What you track** switch at the top of the game screen. Which stat belongs to which lane is one small map in `src/lib/lanes.ts`.

| Situation | What happens |
|---|---|
| You open a live game nobody is tracking | You track **everything**. Nothing to set up if you are on your own. |
| A second parent opens it | They pick up every lane nobody holds. If you already hold both, they watch until you give one up or they take one. |
| Splitting up | Whoever tracks everything taps **Defense** or **Offense**; the other lane is released at once. The second parent taps **Everything** or the lane that is now open, with no confirmation. |
| Taking a lane someone is actively tracking | The app asks first ("Sam is tracking offense… Sam keeps defense"). They lose only that lane, keep the other, and are told on their screen. |
| Watching | Buttons are off for lanes you do not hold; a note on each card says who has it, and numbers update as they tap. Your **Undo** only ever takes back taps in your own lanes. |
| The tracker leaves the screen, ends the game or taps back | Their lanes are released at once; others can start tracking straight away. |
| The tracker's phone dies, loses signal or closes the app | Their phone checks in every 15 s. After 2 minutes of silence their lanes count as free. |
| No signal when you open the game | You are never blocked: after a few seconds the app assumes you hold the lanes and carries on. If it later finds someone else already had one, you switch to watching that lane. |
| Ending the game | Any tracker can end it. It ends for everyone, so the confirm names anyone still tracking. |

Each phone has its **own 1st/2nd half switch**. A phone that opens the game late starts in the half the game is in, and a phone that sees another phone record in a later half moves up with it (it says so, and you can still go back by hand). When the game moves to the 2nd half, tap **2nd half** on each phone.

The lease only decides who the app lets tap; it never rejects stats. Taps recorded on a phone with no signal are still merged when it reconnects, even if someone took the lane meanwhile, so nothing is lost (worst case, a play is counted twice and can be undone). It needs the `0005_tracker_lanes.sql` migration; without it the app quietly falls back to letting anyone tap. In demo mode (one device) you hold whatever you pick.

Schema, row-level security and setup steps are in [docs/BACKEND.md](docs/BACKEND.md) and `supabase/migrations/`.

## Deploy in 5 steps (Vercel or Netlify)

1. Create a free Supabase project and run the SQL in `supabase/migrations/`, in order (`0001`, then `0003` to `0006`; `0002` is no longer needed; see [docs/BACKEND.md](docs/BACKEND.md)). Enable **Anonymous sign-ins** under Authentication.
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
