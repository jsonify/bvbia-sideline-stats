import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Find a Chromium binary without running `playwright install`. */
function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined // fall back to Playwright's own download
  const candidates: string[] = []
  for (const d of readdirSync(root)) {
    if (!d.startsWith('chromium') || d.includes('headless')) continue
    for (const sub of ['chrome-linux', 'chrome-linux64', '.']) {
      candidates.push(join(root, d, sub, 'chrome'))
    }
  }
  return candidates.find(existsSync)
}

const PORT = Number(process.env.E2E_PORT || 4173)
const executablePath = findChromium()

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    // Use the bundled-in-image Chromium when present.
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
