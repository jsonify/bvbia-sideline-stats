import { expect, test, type Locator, type Page } from '@playwright/test'

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
  // Game map: 3 + 1 1v1s, 3 + 1 first contacts at our end, 2 + 1 box entries (the undone one is gone) at theirs
  await expect(page.getByRole('img', { name: /Game map.*Defending end: 4 1v1s, 4 first contacts. Attacking end: 3 box entries/ })).toBeVisible()
  await expect(page.locator('svg.field-map .mk')).toHaveCount(11)
  // All box entries sit inside the attacking box (penalty area is x 88.5-105 of a 105 m pitch); the half toggle filters the dots
  const boxXs = await page.locator('svg.field-map g:has(rect.mk.b)').evaluateAll((gs) => gs.map((g) => Number(/translate\(([\d.]+)/.exec(g.getAttribute('transform') ?? '')?.[1])))
  expect(boxXs).toHaveLength(3)
  for (const x of boxXs) expect(x).toBeGreaterThan(88.5)
  await page.getByRole('radio', { name: '2nd half' }).click()
  await expect(page.locator('svg.field-map .mk')).toHaveCount(0)
  await page.getByRole('radio', { name: '1st half' }).click()
  await expect(page.locator('svg.field-map .mk')).toHaveCount(11)
  await page.getByRole('radio', { name: 'Whole game' }).click()
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
  await expect(page.getByRole('heading', { name: /Track the game/ })).toBeVisible()
  await shot(page, '11-welcome-dark')
  await ctx.close()
})

test('branding is fixed: BVB yellow and the crest, no Team look section, old custom looks ignored', async ({ page }) => {
  // A custom look saved on this device by an earlier version must not come back.
  await page.addInitScript(() => localStorage.setItem('ss-branding', JSON.stringify({ accent: '#E11D2A', appearance: 'dark', logo: null })))
  await page.goto('/')
  // decode() rejects for a missing or broken file (naturalWidth is 0 for a viewBox-only SVG, so it can't be used)
  const decodes = (img: Locator) => img.evaluate((el) => (el as HTMLImageElement).decode().then(() => true, () => false))

  // The crest is on the welcome screen...
  const welcomeCrest = page.locator('.gm-welcome img[src="/Borussia_Dortmund_logo.svg"]')
  await expect(welcomeCrest).toBeVisible()
  await expect.poll(() => decodes(welcomeCrest)).toBe(true)

  // ...and is the tab favicon and the iPhone Home Screen icon (a 180x180 PNG)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/Borussia_Dortmund_logo.svg')
  const touchHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  const touch = await page.request.get(touchHref!)
  expect(touch.ok()).toBe(true)
  expect(touch.headers()['content-type']).toContain('image/png')
  expect((await touch.body()).readUInt32BE(16)).toBe(180) // PNG IHDR width

  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('BVB Fans')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()

  // The crest is in the team bar and actually loaded
  const crest = page.locator('.bd-teambar img[src="/Borussia_Dortmund_logo.svg"]')
  await expect(crest).toBeVisible()
  await expect.poll(() => decodes(crest)).toBe(true)

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByText('Team code').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Team look' })).toHaveCount(0)
  await expect(page.getByLabel('Upload team logo')).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Red' })).toHaveCount(0)

  const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase())
  expect(brand).toBe('#ffd900')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.screenshot({ path: 'e2e/screenshots/12-settings.png', fullPage: true })
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
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
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
  expect(shared.text).toContain('one on defense and one on offense')

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

test('your name: set in Settings, saved on this device', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel('Your name').fill('Sam')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/18-your-name.png', fullPage: true })
  await page.reload()
  await expect(page.getByLabel('Your name')).toHaveValue('Sam')
})

test('split roles: track everything by default, or just defense or offense', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Opponent').fill('Rapids U10')
  await page.getByRole('button', { name: /Save & start tracking/ }).click()
  await expect(page).toHaveURL(/\/track$/)

  const duel = page.getByRole('button', { name: 'Duel won', exact: true })
  const box = page.getByRole('button', { name: 'Box entry with shot', exact: true })
  const picker = page.getByRole('radiogroup', { name: 'What you track' })

  // On your own you track everything, and nothing extra gets in the way
  await expect(page.getByText(/Tracking everything/)).toBeVisible()
  await expect(picker.getByRole('radio', { name: /^Everything/ })).toHaveAttribute('aria-checked', 'true')
  await expect(duel).toBeEnabled()
  await expect(box).toBeEnabled()
  await page.screenshot({ path: 'e2e/screenshots/19-roles-everything.png' })

  // Defense only: the offense card is switched off and says nobody has it
  await picker.getByRole('radio', { name: /^Defense/ }).click()
  await expect(page.getByText(/Tracking defense/)).toBeVisible()
  await expect(duel).toBeEnabled()
  await expect(box).toBeDisabled()
  await expect(page.getByText('Nobody is tracking this yet')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/20-roles-defense.png' })

  // Offense only: its card moves to the top and the 1v1s are off
  await picker.getByRole('radio', { name: /^Offense/ }).click()
  await expect(page.getByText(/Tracking offense/)).toBeVisible()
  await expect(box).toBeEnabled()
  await expect(duel).toBeDisabled()
  const y = async (name: string) => (await page.getByRole('button', { name, exact: true }).boundingBox())!.y
  expect(await y('Box entry with shot')).toBeLessThan(await y('Duel won'))
  await box.click()
  await expect(page.getByTestId('box-tally')).toContainText('1 of 1')

  // Back to everything: nobody else has the lane, so there is nothing to confirm
  await picker.getByRole('radio', { name: /^Everything/ }).click()
  await expect(page.getByText(/Tracking everything/)).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(duel).toBeEnabled()
  expect(errors).toEqual([])
})
