import { expect, test, type Page } from '@playwright/test'

// Targets, halftime numbers, the share image, and season trends, end to end in demo mode.
const SHOTS = process.env.E2E_SHOTS || 'test-results/shots'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })

const tap = async (page: Page, name: string, times: number) => {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name, exact: true }).click()
}

/** Add a game, tap the given 1v1s in each half, and end it. */
async function playGame(page: Page, opponent: string, date: string, halves: [won: number, lost: number][]) {
  await page.goto('/games/new')
  await page.getByLabel('Opponent').fill(opponent)
  await page.getByLabel('Date').fill(date)
  await page.getByRole('button', { name: /Save & start tracking/ }).click()
  await expect(page).toHaveURL(/\/track$/)
  for (const [i, [won, lost]] of halves.entries()) {
    await page.getByRole('button', { name: i === 0 ? '1st half' : '2nd half', exact: true }).click()
    await tap(page, 'Duel won', won)
    await tap(page, 'Duel lost', lost)
    await tap(page, 'First contact clean', 1)
    await tap(page, 'Box entry with shot', 1)
    await tap(page, 'Box entry, no shot', 1)
  }
  await page.getByRole('button', { name: 'End game', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'End game' }).click()
  await expect(page).toHaveURL(/\/games\/[^/]+$/)
}

test('targets -> halftime numbers -> share image -> season trends', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('/')
  await page.getByRole('button', { name: /Create my team/ }).click()
  await page.getByLabel('Team name').fill('U10 Thunder')
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()

  // The coach sets targets once, for the whole team.
  await page.goto('/settings')
  await page.getByLabel('Defensive 1v1s won').fill('60')
  await page.getByLabel('Box entries with a shot').fill('50')
  await page.getByRole('button', { name: 'Save targets' }).click()
  await expect(page.getByText('Saved for the whole team')).toBeVisible()
  await page.getByLabel('Defensive 1v1s won').scrollIntoViewIfNeeded()
  await shot(page, 'c1-targets')

  await playGame(page, 'Rapids', '2026-09-06', [[1, 3], [2, 2]])
  await playGame(page, 'Hawks', '2026-09-13', [[2, 2], [3, 1]])
  await playGame(page, 'Owls', '2026-09-20', [[3, 1], [4, 1]])

  // Halftime: tracking the rematch, the 1st half is done.
  await page.goto('/games/new')
  await page.getByLabel('Opponent').fill('Rapids')
  await page.getByLabel('Date').fill('2026-10-04')
  await page.getByRole('button', { name: /Save & start tracking/ }).click()
  await expect(page.getByText('Target 60%')).toBeVisible()
  await tap(page, 'Duel won', 4)
  await tap(page, 'Duel lost', 1)
  await tap(page, 'First contact clean', 3)
  await tap(page, 'First contact miss', 1)
  await tap(page, 'Box entry with shot', 1)
  await tap(page, 'Box entry, no shot', 2)
  await shot(page, 'c2-tracker-targets')
  await page.getByRole('button', { name: /Halftime numbers/ }).click()
  const half = page.getByRole('dialog', { name: 'Halftime numbers' })
  await expect(half.getByRole('region', { name: '1st half stats' })).toContainText('Target 60% · met')
  await expect(half.getByRole('region', { name: '1st half stats' })).toContainText('Target 50% · 17 pts short')
  await page.waitForTimeout(900)
  await shot(page, 'c3-halftime')
  await half.getByRole('button', { name: 'Back to tracking' }).click()
  await expect(half).toHaveCount(0)
  await page.getByRole('button', { name: '2nd half', exact: true }).click()
  await tap(page, 'Duel won', 3)
  await tap(page, 'Box entry with shot', 2)
  await page.getByRole('button', { name: /Halftime numbers/ }).click()
  await expect(half.getByRole('row', { name: /Game so far/ })).toBeVisible()
  await page.waitForTimeout(900)
  await shot(page, 'c4-halftime-2nd')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'End game', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'End game' }).click()

  // Summary: targets on the gauges, the earlier Rapids game, and the share image.
  await expect(page).toHaveURL(/\/games\/[^/]+$/)
  await expect(page.getByRole('region', { name: 'Key stats' })).toContainText('Target 60% · met')
  const h2h = page.getByRole('region', { name: 'Against Rapids before' })
  await expect(h2h.getByRole('row', { name: /This game/ })).toContainText('7/8')
  await page.waitForTimeout(1200)
  await shot(page, 'c5-summary')
  await h2h.scrollIntoViewIfNeeded()
  await shot(page, 'c6-summary-h2h')
  await page.getByRole('button', { name: 'Share image' }).click()
  const sheet = page.getByRole('dialog', { name: 'Share the summary' })
  const img = sheet.getByRole('img', { name: /Summary card/ })
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1080)
  await page.waitForTimeout(400)
  await shot(page, 'c7-share-sheet')
  const download = page.waitForEvent('download')
  await sheet.getByRole('button', { name: 'Save image' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('rapids-2026-10-04-summary.png')
  await file.saveAs(`${SHOTS}/c8-share-card.png`)

  // Season: recent form, 3-game average and target lines, and the opponent table.
  await page.goto('/season')
  const chart = page.getByRole('region', { name: 'Defensive 1v1s won by game' })
  await expect(chart.getByText(/^Last 3 games:/)).toBeVisible()
  await expect(chart.getByRole('img', { name: /target 60%/ })).toBeVisible()
  await chart.scrollIntoViewIfNeeded()
  await shot(page, 'c9-season-chart')
  const opp = page.getByRole('region', { name: 'By opponent' })
  await expect(opp.getByRole('row', { name: /Rapids/ })).toContainText('2')
  await opp.scrollIntoViewIfNeeded()
  await shot(page, 'c10-season-opponents')

  expect(errors).toEqual([])
})
