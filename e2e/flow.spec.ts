import { expect, test, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: false })

test('team -> game -> track -> undo -> end -> summary -> season', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // Onboarding: create a team (demo mode, local storage)
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome/)
  await shot(page, '01-welcome')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await expect(page.getByRole('heading', { name: /all set/i })).toBeVisible()
  await shot(page, '02-team-created')
  await page.getByRole('button', { name: /Let's go/ }).click()

  // Empty games list -> new game
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()
  await shot(page, '03-games-empty')
  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Opponent').fill('Rapids U10')
  await shot(page, '04-game-form')
  await page.getByRole('button', { name: /Save & start tracking/ }).click()

  // Tracker
  await expect(page).toHaveURL(/\/track$/)
  const tap = async (name: string, times: number) => {
    for (let i = 0; i < times; i++) await page.getByRole('button', { name, exact: true }).click()
  }
  await tap('Duel won', 3)
  await tap('Duel lost', 1)
  await tap('First contact clean', 2)
  await page.getByRole('radio', { name: /Long ball/ }).click()
  await tap('First contact clean', 1)
  await tap('First contact miss', 1)
  await tap('Box entry with shot', 2)
  await tap('Box entry, no shot', 2)
  await shot(page, '05-tracker')

  // Undo the last tap (a no-shot box entry): 2 shot / 1 no-shot
  await page.getByRole('button', { name: /^Undo last/ }).click()
  await expect(page.getByRole('button', { name: /^Undo last: .*/ })).toBeVisible()
  await shot(page, '06-tracker-after-undo')

  // End the game
  await page.getByRole('button', { name: 'End game', exact: true }).click()
  await shot(page, '07-end-confirm')
  await page.getByRole('alertdialog').getByRole('button', { name: 'End game' }).click()

  // Summary: duels 3/4 = 75%, first contact 3/4 = 75%, box 2/3 = 67%
  await expect(page).toHaveURL(/\/games\/[^/]+$/)
  const hero = page.getByRole('region', { name: 'Key stats' })
  await expect(hero.getByRole('group', { name: 'Defensive 1v1s won' })).toContainText('75%')
  await expect(hero.getByRole('group', { name: 'Clean first contact' })).toContainText('75%')
  await expect(hero.getByRole('group', { name: 'Box entries with a shot' })).toContainText('67%')
  await shot(page, '08-summary')

  // Season page
  await page.goto('/season')
  await expect(page.getByRole('heading', { name: 'Season', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Season totals' })).toContainText('75%')
  await page.waitForTimeout(800) // let charts animate
  await shot(page, '09-season')

  // Games list now has the game
  await page.goto('/')
  await expect(page.getByText('Rapids U10').first()).toBeVisible()
  await shot(page, '10-games')

  expect(errors).toEqual([])
})

test('dark theme screenshot', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 412, height: 915 } })
  const page = await ctx.newPage()
  await page.goto('/welcome')
  await shot(page, '11-welcome-dark')
  await ctx.close()
})

test('team look: black/white/yellow default, upload logo, change accent, persists', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('BVB Fans')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await page.getByRole('link', { name: 'Settings' }).click()

  const brand = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase())
  expect(await brand()).toBe('#fde100')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('radio', { name: 'Light' }).click()
  await page.screenshot({ path: 'e2e/screenshots/12-team-look-light.png', fullPage: true })

  // 1x1 red PNG as the "logo"
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
  await page.getByLabel('Upload team logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Team logo preview')).toBeVisible()
  await page.getByRole('radio', { name: 'Red' }).click()
  expect(await brand()).toBe('#e11d2a')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Save team look' }).click()
  await expect(page.getByRole('button', { name: 'Save team look' })).toBeDisabled()

  await page.reload()
  expect(await brand()).toBe('#e11d2a')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByAltText('BVB Fans logo').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/13-team-look-saved.png', fullPage: true })

  await page.getByRole('button', { name: /Reset to black/ }).click()
  await page.getByRole('button', { name: 'Save team look' }).click()
  await page.getByRole('radio', { name: 'Dark' }).click()
  expect(await brand()).toBe('#fde100')
})

test('multiple teams: add, switch, keep games + season stats separate, remove', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })

  // Team A with one tracked game
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Opponent').fill('Rapids')
  await page.getByRole('button', { name: /Save & start tracking/ }).click()
  await page.getByRole('button', { name: 'Duel won', exact: true }).click()
  await page.getByRole('button', { name: 'Duel won', exact: true }).click()
  await page.getByRole('link', { name: /Back to games/ }).click()
  await expect(page.getByText('Rapids').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Viewing U10 Thunder/ })).toBeVisible()

  // Add team B from the Teams tab
  await nav('Teams').click()
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
  await page.getByRole('link', { name: /Add or join a team/ }).click()
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U12 Lightning')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()

  // B is active and starts empty; A's game and stats must not leak in
  await expect(page.getByRole('link', { name: /Viewing U12 Lightning/ })).toBeVisible()
  await expect(page.getByText('No games yet')).toBeVisible()
  await expect(page.getByText('Rapids')).toHaveCount(0)
  await nav('Season').click()
  await expect(page.getByText('Rapids')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/14-team-b-season-empty.png' })

  // Switch back to A: its game is still there
  await nav('Teams').click()
  await page.screenshot({ path: 'e2e/screenshots/15-teams.png' })
  await page.getByRole('button', { name: /U10 Thunder, switch to this team/ }).click()
  await expect(page.getByRole('link', { name: /Viewing U10 Thunder/ })).toBeVisible()
  await expect(page.getByText('Rapids').first()).toBeVisible()

  // Remove B from this device; A stays
  await nav('Teams').click()
  await page.getByRole('button', { name: /Remove U12 Lightning/ }).click()
  await expect(page.getByRole('alertdialog')).toContainText('team code')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('button', { name: /U12 Lightning/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'U10 Thunder, current team' })).toBeVisible()

  // Settings tab holds the admin work
  await nav('Settings').click()
  await expect(page.getByRole('heading', { name: 'Team look' })).toBeVisible()
  await expect(page.getByText('Team code').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('invite: Share code sends the app link, the code and the steps; the link opens the join screen with the code filled in', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Stand in for the phone's share sheet so we can read exactly what a parent would send.
  await page.addInitScript(() => {
    ;(navigator as any).share = async (data: unknown) => { ;(window as any).__shared = data }
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await expect(page.getByRole('heading', { name: /all set/i })).toBeVisible()
  const code = (await page.locator('.ss-code').innerText()).trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)

  // The card explains the steps on screen too
  await expect(page.getByText('How other parents join')).toBeVisible()
  await expect(page.getByLabel('Invite link')).toContainText(`/welcome?code=${code}`)
  await page.screenshot({ path: 'e2e/screenshots/16-invite-card.png', fullPage: true })

  await page.getByRole('button', { name: 'Share code' }).click()
  const shared = await page.evaluate(() => (window as any).__shared as { title: string; text: string })
  const link = `${new URL(page.url()).origin}/welcome?code=${code}`
  expect(shared.text).toContain('U10 Thunder')
  expect(shared.text).toContain(link)
  expect(shared.text).toContain(code)
  expect(shared.text).toContain('Tap this link to open the app')
  expect(shared.text).toContain('Tap "Join with team code" and paste this code')
  expect(shared.text).toContain('Tap "Join team"')
  expect(shared.text).toContain('One parent tracks each game at a time')

  // Opening the link: straight to the join step, code already in the box
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Enter your team code' })).toBeVisible()
  await expect(page.getByLabel('Team code')).toHaveValue(code)
  await expect(page.getByText(/filled in the code from your invite link/i)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/17-join-from-link.png' })
  await page.getByRole('button', { name: 'Join team' }).click()
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()

  // Without a link, pasting the code (any case, stray spaces) works too
  await page.goto('/welcome?add=1')
  await page.getByRole('button', { name: /Join with team code/ }).click()
  await expect(page.getByText(/Paste the team code from the invite you were sent/)).toBeVisible()
  await page.getByLabel('Team code').fill(` ${code.toLowerCase().slice(0, 3)} ${code.toLowerCase().slice(3)} `)
  await page.getByRole('button', { name: 'Join team' }).click()
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
