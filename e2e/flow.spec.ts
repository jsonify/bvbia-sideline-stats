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
