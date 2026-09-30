# Deploying Sideline Stats

Sideline Stats is a static single-page app (Vite build in `dist/`). Any static host works; the only requirement is that unknown paths fall back to `index.html` (client-side routing) and that the site is served over HTTPS (needed for the service worker / install prompt).

## 1. Backend (Supabase)

1. Create a project at supabase.com.
2. Run the migrations in `supabase/migrations/` (SQL editor, or `supabase db push`). Details: [BACKEND.md](BACKEND.md).
3. Authentication -> Providers -> enable **Anonymous sign-ins**.
4. Project Settings -> API: copy the **Project URL** and the **anon public key**.

The anon key is safe to ship to the browser; access is protected by row-level security.

## 2. Vercel

1. Import the GitHub repo. Preset: Vite.
2. Build command `npm run build`, output directory `dist` (already in `vercel.json`).
3. Environment variables (Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Deploy. `vercel.json` rewrites all non-asset routes to `/index.html` and sets long-lived caching for `/assets/*` and `no-cache` for `/sw.js`.

## 3. Netlify

Create `public/_redirects` containing:

```
/*  /index.html  200
```

Build command `npm run build`, publish directory `dist`, same two environment variables.

## 4. Install on phones

Open the site in Safari (iOS) or Chrome (Android) -> Share/menu -> **Add to Home Screen**. It then launches full-screen and keeps working with poor signal; taps sync when the connection returns.

## 5. Sharing with other parents

The team page shows a **join code**. Other volunteers open the app, choose "Join a team" and enter the code. Everyone sees the same games and all taps merge.

## Troubleshooting

- **Blank page or 404 on refresh**: SPA rewrite missing (see the Vercel/Netlify sections).
- **App stays in demo mode**: the `VITE_*` variables were not present at *build* time; set them and redeploy.
- **Updates do not appear**: the service worker updates on next load; close and reopen the app once.
- **Sign-in errors**: confirm Anonymous sign-ins are enabled in Supabase.
