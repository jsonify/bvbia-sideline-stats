import { expect, test, type Locator, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: false })

// These walk-throughs tap with the buttons; the field has its own test (flow.spec.ts, 'tap on the field').
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('e2e-field')) localStorage.setItem('sideline.tapStyle', 'buttons') })
})

/** First time in the app it asks for your name (shown to other parents while you track). */
const giveName = async (page: Page, name = 'Sam') => {
  await page.getByRole('dialog', { name: "What's your name?" }).getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

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
  await giveName(page)

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

  // The stat guide: an "i" on each card explains the stat in plain words and leaves the live game alone
  await page.getByRole('button', { name: 'About First contact' }).click()
  const guide = page.getByRole('dialog', { name: 'What each stat means' })
  await expect(guide.getByRole('heading', { name: 'Through ball' })).toBeVisible()
  await expect(guide.getByRole('img', { name: /rolls a pass along the ground between two of our defenders/ }).first()).toBeVisible()
  await page.waitForTimeout(400) // let the sheet finish sliding up
  await shot(page, '21-stat-guide')
  await guide.getByRole('tab', { name: 'Box entries' }).click()
  await expect(guide.getByText(/penalty area/).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(guide).toHaveCount(0)
  await expect(page.getByTestId('contact-tally')).toContainText('3 of 4') // nothing was tapped by looking around

  // Undo the last tap (a no-shot box entry): 2 shot / 1 no-shot
  await page.getByRole('button', { name: /^Undo last/ }).click()
  await expect(page.getByRole('button', { name: /^Undo last: .*/ })).toBeVisible()
  await shot(page, '06-tracker-after-undo')

  // Goals are logged as they go in, from the score in the header: tap it, then tap who scored
  const goal = async (team: RegExp) => {
    await page.getByRole('button', { name: /Log a goal$/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Who scored?' })
    await sheet.getByRole('button', { name: team }).click()
    await expect(sheet).toHaveCount(0)
  }
  await goal(/^⚽ (?!Rapids)/)
  await page.getByRole('button', { name: /Log a goal$/ }).click()
  await page.waitForTimeout(600) // let the sheet slide up
  await shot(page, '06b-goal-sheet')
  await page.getByRole('dialog', { name: 'Who scored?' }).getByRole('button', { name: /^⚽ Rapids/ }).click()
  await goal(/^⚽ (?!Rapids)/)
  await expect(page.getByRole('button', { name: /^Score: .* 2, Rapids U10 1\. Log a goal$/ })).toBeVisible()
  await shot(page, '06c-tracker-score')

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

  // Thank whoever tracked with a heart: one tap gives it, another takes it back, and the stats don't move
  const heart = page.getByRole('button', { name: /^Thanks/ })
  await expect(page.getByText('Say thanks to whoever tracked this game')).toBeVisible()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Thanked by You')).toBeVisible()
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Thanked by')).toHaveCount(0)
  await heart.click()
  await expect(page.getByText('Thanked by You')).toBeVisible()
  await expect(hero.getByRole('group', { name: 'Defensive 1v1s won' })).toContainText('75%')
  await shot(page, '08-summary')

  // The score logged during the game is already there; it can still be fixed on the summary
  const final = page.getByRole('region', { name: 'Final score' })
  await expect(final).toContainText('Win')
  await final.getByRole('button', { name: 'Edit score' }).click()
  await shot(page, '08b-score-edit')
  await page.getByRole('button', { name: 'Cancel' }).click()

  // Season page
  await page.goto('/season')
  await expect(page.getByRole('heading', { name: 'Season', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Season totals' })).toContainText('75%')
  await page.waitForTimeout(800) // let charts animate
  await shot(page, '09-season')
  const results = page.getByRole('region', { name: 'Results' })
  await expect(results).toContainText('1W 0D 0L')
  await expect(results).toContainText('Scored 2 · Conceded 1 (+1)')
  await results.scrollIntoViewIfNeeded()
  await shot(page, '09b-season-results')

  // Games list now has the game
  await page.goto('/')
  await expect(page.getByText('Rapids U10').first()).toBeVisible()
  await expect(page.locator('.th-tag')).toContainText('1') // the heart given on the summary shows on the game's card
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
  await giveName(page)

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
  await giveName(page)
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

test('your name: asked for on first open, saved on this device, changeable in Settings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  const prompt = page.getByRole('dialog', { name: "What's your name?" })
  await expect(prompt).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/18-your-name.png', fullPage: false })
  await prompt.getByLabel('Your name').fill('Sam')
  await prompt.getByRole('button', { name: 'Save name' }).click()
  await expect(prompt).toHaveCount(0)
  await page.reload()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByLabel('Your name')).toHaveValue('Sam')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('split roles: track everything by default, or just defense or offense', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await giveName(page)
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

test('delete a game: the confirmation sits above the tab bar and its buttons can be tapped', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await giveName(page)
  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Opponent').fill('Rapids')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Options for Rapids' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const sheet = page.getByRole('dialog', { name: 'Delete this game?' })
  await expect(sheet).toBeVisible()
  const del = sheet.getByRole('button', { name: 'Delete' })
  await expect(del).toBeInViewport({ ratio: 1 })
  await page.waitForTimeout(500) // let the sheet finish springing up
  await page.screenshot({ path: 'e2e/screenshots/22-delete-game.png', fullPage: false })
  await del.click() // a click is refused if the tab bar or anything else covers the button
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText('No games yet')).toBeVisible()
})

test('tap on the field: box entry, our half, and the field turns round at halftime', async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem('e2e-field', '1'); localStorage.removeItem('sideline.tapStyle') })
  await page.setViewportSize({ width: 390, height: 664 }) // an iPhone with Safari's bars showing: everything must be in reach without scrolling
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await giveName(page)
  await page.goto('/games/new')
  await page.getByLabel('Opponent').fill('Rovers')
  await page.getByRole('button', { name: /Save & start tracking/ }).click()
  await expect(page).toHaveURL(/\/track$/)

  const field = page.getByRole('region', { name: 'Field' })
  await expect(field).toBeVisible()
  await shot(page, '20-field')
  await expect(field.getByRole('button', { name: /^Their box: Right, close to goal/ })).toBeInViewport({ ratio: 1 })
  await field.getByRole('button', { name: /^Their box: Centre, close to goal/ }).click()
  await expect(page.getByRole('button', { name: 'Box entry with shot' })).toBeInViewport({ ratio: 1 })
  await shot(page, '21-field-box-entry')
  await page.getByRole('button', { name: 'Box entry with shot' }).click()
  await expect(page.getByTestId('box-tally')).toContainText('1 of 1')

  await field.getByRole('button', { name: /^Our half: Left, deep in our half/ }).click()
  await expect(page.getByRole('button', { name: 'Long ball miss' })).toBeInViewport({ ratio: 1 })
  await shot(page, '22-field-our-half')
  await page.getByRole('button', { name: 'Through ball clean' }).click()
  await expect(page.getByTestId('contact-tally')).toContainText('1 of 1')

  await page.getByRole('button', { name: '2nd half' }).click()
  await expect(field).toHaveClass(/flip/)
  await field.getByRole('button', { name: /^Their box: Right, edge of the box/ }).click()
  await expect(page.getByTestId('box-tally')).toContainText('1 of 2', { timeout: 12_000 }) // no answer: saved as No shot
  await shot(page, '23-field-second-half')

  // Offense only: just the box, across the whole width.
  await page.getByRole('radio', { name: /^Offense/ }).click()
  await expect(field.getByRole('button', { name: /^Our half:/ })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, '24-field-offense-only')

  // Defense only: just our half, and its choices in reach.
  await page.getByRole('radio', { name: /^Defense/ }).click()
  await expect(field.getByRole('button', { name: /^Their box:/ })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, '25-field-defense-only')
  await field.getByRole('button', { name: /^Our half: Right, near halfway/ }).click()
  // The "Now tracking defense" message must not cover the choices.
  const sheet = await page.getByRole('group', { name: /^Our half, / }).boundingBox()
  const toast = await page.getByText('Now tracking defense').boundingBox()
  if (toast && sheet) expect(toast.y + toast.height).toBeLessThan(sheet.y)
  for (const name of ['Duel won', 'Duel lost', 'Through ball clean', 'Through ball miss', 'Long ball clean', 'Long ball miss', 'Cancel']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
  }
  await shot(page, '26-field-defense-pick')
})

test('half lengths on the game form run the clock on the tracker', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await giveName(page)
  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Opponent').fill('Rapids U10')
  await page.getByLabel('Half length').selectOption('30')
  await expect(page.getByText('Full game: 60 min')).toBeVisible()
  await page.getByLabel('Half length').scrollIntoViewIfNeeded()
  await shot(page, '04b-half-lengths')
  await page.getByRole('button', { name: /Save & start tracking/ }).click()

  await expect(page).toHaveURL(/\/track$/)
  const timer = page.getByRole('timer')
  await expect(timer).toHaveAttribute('aria-label', /0:00 of 30:00, not started\. Game: 0:00 of 60:00/)
  await page.getByRole('button', { name: 'Kick off' }).click()
  await expect(timer).toHaveAttribute('aria-label', /0:0[1-9] of 30:00, running/, { timeout: 4000 })
  await shot(page, '05b-clock-running')
  await page.getByRole('button', { name: /Show time left/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Game clock' })
  await expect(sheet.getByRole('group', { name: '1st half' })).toContainText(/Time left29:5\d/)
  await page.waitForTimeout(700) // let the sheet finish springing up
  await shot(page, '05d-clock-sheet')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await page.getByRole('button', { name: '2nd half' }).click()
  await page.getByRole('button', { name: 'Start 2nd half' }).click()
  await expect(timer).toHaveAttribute('aria-label', /2nd half clock: .* running\. Game: 0:0\d of 60:00/)
  await expect(page.getByRole('button', { name: /Pause/ })).toHaveCount(0) // a running clock: no pause
  await shot(page, '05c-clock-second-half')
})

test('season schedule: enter games ahead of time, see the full season, edit one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U12 Season')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await giveName(page)

  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Date').fill('2099-10-24')
  await page.getByLabel(/Kick-off/).fill('10:30')
  for (const [opp, where] of [['Rapids', 'Magnuson 7'], ['Crossfire', 'Starfire 3'], ['Eastside FC', 'Marymoor 5']]) {
    await page.getByLabel('Opponent').fill(opp)
    await page.getByLabel(/Location/).fill(where)
    await page.getByRole('button', { name: 'Save & add another' }).click()
    await expect(page.getByRole('status').filter({ hasText: `Added vs ${opp}` })).toBeVisible()
  }
  await shot(page, '27-add-another')
  await page.getByRole('link', { name: /Games/ }).first().click()

  await page.getByText('Full season').click()
  await expect(page.getByText('Next game')).toBeVisible()
  await expect(page.getByText(/3 games · 3 to play/)).toBeVisible()
  await page.waitForTimeout(500) // let the toggle's pill finish sliding
  await shot(page, '28-full-season')

  // Still editable: move the Crossfire game's kick-off.
  await page.getByRole('button', { name: 'Options for Crossfire' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByLabel(/Kick-off/)).toHaveValue('10:30')
  await page.getByLabel(/Kick-off/).fill('13:00')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()
  await expect(page.locator('.gm-card', { hasText: 'Crossfire' })).toContainText('1:00')
})

test('a game later in the season: the tracker is shown locked until game day', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U11 Locked')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await giveName(page)
  await page.getByRole('link', { name: /Add your first game/ }).click()
  await page.getByLabel('Opponent').fill('Washington Rush')
  await page.getByLabel('Date').fill('2099-10-24')
  await page.getByText('Away', { exact: true }).click()
  await page.getByLabel(/Location/).fill('13903 North Creek Dr, Mill Creek, WA')
  await page.getByLabel(/Kick-off/).fill('10:30')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await page.getByText('@ Washington Rush').or(page.getByText('vs Washington Rush')).click()
  await expect(page.getByText('Tracking opens on game day.')).toBeVisible()
  await expect(page.getByRole('link', { name: /tracking/i })).toHaveCount(0)

  const id = page.url().split('/').pop()
  await page.goto(`/games/${id}/track`)
  await expect(page.getByRole('status', { name: 'Tracking is locked' })).toBeVisible()
  await expect(page.locator('.tk-title h1')).toHaveText('@ Washington Rush')
  await page.waitForTimeout(400)
  await shot(page, '29-tracker-locked')
  await page.getByRole('link', { name: /Back to games/ }).click()
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()
})
