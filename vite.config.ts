/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// Which build this is, shown at the bottom of Settings so you can tell a phone picked up a deploy.
// Vercel passes the commit; locally it comes from git.
function commitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'dev' }
}

export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(commitSha().slice(0, 7)), __APP_BUILT__: JSON.stringify(new Date().toISOString()) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // AppUpdate shows "new version ready"; never swap code under a parent mid-game
      injectRegister: false,
      includeAssets: ['Borussia_Dortmund_logo.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        lang: 'en',
        categories: ['sports'],
        name: 'Sideline Stats',
        short_name: 'Sideline',
        description: 'Live team stats for soccer parent volunteers.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // a tap on the icon goes back to the open window (and whatever game is on screen) instead of restarting it;
        // shortcuts and invite links reach that window through LaunchHandler
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        handle_links: 'preferred',
        shortcuts: [
          { name: 'New game', short_name: 'New game', url: '/games/new', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Season stats', short_name: 'Season', url: '/season', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        screenshots: [
          { src: 'screenshots/games.png', sizes: '541x1101', type: 'image/png', form_factor: 'narrow', label: 'Your team\'s games' },
          { src: 'screenshots/tracker.png', sizes: '541x1101', type: 'image/png', form_factor: 'narrow', label: 'Track stats live from the sideline' },
          { src: 'screenshots/summary.png', sizes: '541x1101', type: 'image/png', form_factor: 'narrow', label: 'Game summary' },
          { src: 'screenshots/season.png', sizes: '541x1101', type: 'image/png', form_factor: 'narrow', label: 'Season trends' },
        ],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'Borussia_Dortmund_logo.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['splash/**', 'screenshots/**'], // only fetched by the OS at install time, not needed offline
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: 'jsdom', globals: true, exclude: ['e2e/**', 'node_modules/**'], setupFiles: ['./src/test-setup.ts'] },
})
