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

**A guide for parents who are new to soccer.** Every stat has a small **ⓘ** next to its name: on each card of the tracker, and on the key stats of the game summary and season pages. Tapping it opens a sheet that explains the stat in plain words, with a picture for every button (what makes a through ball *clean* or a *miss*, what a *box entry* is, when a 1v1 is *won*). The sheet opens over the page, so a live game is never left or interrupted, and it stays available to anyone who is only watching. All the wording is in one file, `src/features/guide/topics.ts`; the pictures are in `src/features/guide/Scene.tsx`.

**Say thanks with a heart.** Tracking is quiet work, so any parent can tap the **♥ Thanks** heart on a game that is live or finished to thank whoever tracked it, and tap again to take it back. One heart per parent per game. The parent tracking sees who thanked them (a small ♥ line under the header, with no button, since they are the one being thanked), and the games list shows a heart count on each game; a game nobody has thanked just shows nothing. Hearts are only an acknowledgement and never touch the stats. A heart is sent straight away rather than queued, so it needs a signal: with none, it un-does itself and says so. It needs the `0006_game_thanks.sql` migration; without it the heart simply doesn't save and nothing else is affected. In demo mode (one device) it works too, on this device only.

**Who's watching.** A live game's summary and tracker show how many parents have it open right now and how many have followed it so far ("3 watching now · 7 so far"); a finished game shows how many followed it live. Each phone with a live game open checks in every 20 seconds (only while its screen is on) and counts as watching for a minute after. It is only a count, never stored on the phone or mixed into the stats. It needs the `0012_game_viewers.sql` migration; without it, and in demo mode, nothing shows.

**Tell the families.** Next to **Share code**, **Share announcement** sends a short note for the families' group chat with the join link, naming the game being played now or the next one on the calendar: "Hey families! If anyone is interested in following the stats for our game against Rovers, here's the link to join the action: … 💛🖤".

**Team targets.** In **Settings → Team targets** the coach sets a target for each stat (say, win 60% of 1v1s), shared with everyone on the team. The gauges on the game summary, the season page and the halftime sheet mark it on the dial and say whether it was met ("Target 60% · 8 pts short"); the tracker's bars carry a small mark, the season charts a dotted line, and the by-half table a ✓ in each cell that reached it. A box left empty means no target. It needs the `0007_team_goals.sql` migration; without it the targets can't be saved (Settings says so) and nothing else is affected.

**Halftime numbers.** Once something has been tapped, the tracker shows a **Halftime numbers** button (**Break numbers** for quarters). It opens a sheet over the tracker with the latest half's three gauges, its takeaways and, from the 2nd half on, every half side by side with a "Game so far" row. It is a sheet, not a page, so the phone keeps tracking.

**Trends and opponents.** Each season chart has a dashed 3-game average line, and a "Last 3 games" line above it that pools those games against all the games before them ("76%, up 39 pts on the games before"). It only appears once there are earlier games and 5+ events on each side. Once you've played a team twice, the season page adds a **By opponent** table, and a game summary shows **Against <opponent> before**: this game next to every earlier game against them, with ▲▼ against the last meeting. Names match however they were typed ("Bears" and " bears").

**Score and results.** Goals are logged as they happen, so nobody has to remember the score at the end. The tracker's header shows the score in one small bar above the half switch, out of the way of the stat buttons and the field. Tap it, then tap who scored (two taps); the same sheet can take a goal back. Any phone that is tracking can log a goal, and phones that are only watching see the score update. A goal is not a stat tap: it never shows in Undo or the percentages. Each change builds on the latest score the phone has, so ending the game never wipes a goal another phone just logged. The summary page shows the score and lets anyone fix it with **Edit**. If a game ended without any goals logged, it asks **What was the final score?** instead. The games list and the season's All games table show it (green for a win, red for a loss), and the shared text summary and season CSV include it. The season page then has a **Results** card: the record (W D L, goals for and against) and two small tables that put the stats next to the result. **Attack and goals scored** shows goals, box entries, shots and entries with a shot per game in wins, draws and losses; **Defense and goals conceded** shows goals conceded, 1v1s won and clean contact. Below them, plain sentences say what was most different in wins than in losses ("1v1s won: 66% in wins, 18 pts higher than in losses"), and, for each team target, the record when it was reached and when it wasn't. Only games with both a score and tracked stats count in the tables. It needs the `0009_game_score.sql` migration to be shared; without it the score stays on the phone that entered it and nothing else is affected.

**Half lengths and the game clock.** The game form has a **Half length** dropdown (30, 35 or 45 minutes), used for both halves since they are always the same length, and shows the full game ("Full game: 70 min"). A new game starts with the length of the team's last game. It is optional. On the tracker, the clock sits beside the score, each in its own box. It is a running clock: it shows the half on screen counting up to its length ("12:34 of 30:00") and the whole game under it, which is the halves added up ("Game 42:34 / 60:00"). **Kick off** (▶) starts the 1st half and makes the game live; the half stops by itself at its length ("Halftime"), and **Start 2nd half** (▶) starts the 2nd, which stops by itself at full time. There is no pause. Tap the clock to open a **Game clock** sheet with the time played counting up beside the time left counting down, for the half and for the whole game. **Reset** (after asking) puts a half back to 0:00 if it was started by mistake. Phones that are tracking buzz once when a half stops. The clock lives on the game, so every phone shows the same time, any phone that is tracking can run it, phones that are only watching just see it, and a phone moves to the 2nd half when another phone kicks it off. Ending the game stops it. Without a half length set, a half keeps counting until the next half kicks off or the game ends. The summary's **By half** card shows the time played ("Played 30:00 + 30:00 = 60:00 (set for 2 × 30 = 60 min)"). It needs `0010_game_clock.sql` to be shared; without it the lengths and clock stay on the phone that set them.

**Share image.** **Share image** on the game summary draws the summary as a picture (1080 × 1350, always light): a final score banner (once a score is entered), the three gauges with targets, each half, and the game map. It opens a preview, then the phone's share sheet (WhatsApp, Messages, …), or **Save image** where a browser can't share files. **Share summary** still sends it as text.

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
- **Installable app**: Add to Home Screen opens it full screen with a launch screen, a "New game" / "Season" long-press shortcut, an icon badge for stats not yet synced, and an Update banner for new versions. Settings walks iPhone users through installing.
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

1. Create a free Supabase project and run the SQL in `supabase/migrations/`, in order (`0001`, then `0003` to `0012`; `0002` is no longer needed; see [docs/BACKEND.md](docs/BACKEND.md)). Enable **Anonymous sign-ins** under Authentication.
2. Push this repo to GitHub.
3. Import it in Vercel (or Netlify). Framework preset: **Vite**. Build command `npm run build`, output `dist`. `vercel.json` already contains the SPA rewrites.
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy, open the URL on your phone and use **Add to Home Screen** to install it.

More detail (Netlify redirects, custom domain, troubleshooting) in [docs/DEPLOY.md](docs/DEPLOY.md).

## Project layout

```
src/ui/              design system (base.css tokens + Button, Card, Chip, Segmented, Toast, ...)
src/data/            repository (local + Supabase), sync
src/features/        games, tracker, stats, shell, guide (the ⓘ stat explainer)
src/lib/summary.ts   the single source of truth for all percentages
e2e/                 Playwright tests (screenshots land in e2e/screenshots)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions.
