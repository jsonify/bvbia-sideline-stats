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
- Realtime subscriptions on `games` and `stat_events` trigger a merge-pull into the local cache so two parents tracking simultaneously see each other's taps.
- Caveat: an anonymous identity lives in the browser. Clearing site data loses membership; re-join with the code (data is safe in the cloud).

## Team branding (logo + colors) — run `0002_branding.sql`

After `0001_init.sql`, open **SQL Editor → New query**, paste `supabase/migrations/0002_branding.sql` and **Run**.
It adds a `branding` column to `teams` and a `set_team_branding` function, so the logo and accent color saved in
**Team → Team look** are shared with every parent on the team. Without it, saving the team look shows an error.
The logo is resized to at most 256px in the browser and stored inline (no Storage bucket needed).
