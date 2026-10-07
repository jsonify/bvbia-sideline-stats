import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RepoContext } from '../../data/context'
import type { GameLanes, GameThanks, GameTracker, Repository } from '../../data/repository'
import { LANES, type Lane } from '../../lib/lanes'
import type { Game, StatEvent } from '../../types'
import TrackerPage from './TrackerPage'
import { CLAIM_WAIT_MS, LEASE_TICK_MS } from './useTracker'

const ME: GameTracker = { holder: 'me', idleSeconds: 0, name: null }
const OTHER: GameTracker = { holder: 'other', idleSeconds: 12, name: null }
const NOBODY: GameTracker = { holder: 'none', idleSeconds: null, name: null }
const BOTH: Lane[] = [...LANES]
/** The same tracker on both lanes, the way a whole game used to be held. */
const all = (t: GameTracker): GameLanes => ({ defense: t, offense: t })
const sam = (idleSeconds = 3): GameTracker => ({ holder: 'other', idleSeconds, name: 'Sam' })

function fakeRepo(status: Game['status'] = 'live', initial: GameTracker | GameLanes = ME) {
  let game: Game = { id: 'g1', teamId: 't', opponent: 'Rovers', date: '2026-01-01', home: true, periods: 2, status, createdAt: '', updatedAt: '' }
  const events: StatEvent[] = []
  const hearts: GameThanks[] = []
  const subs = new Set<() => void>()
  const nudges = new Set<() => void>()
  let n = 0
  // Who holds each lane on the server. Free/mine claims succeed, someone else's live lease needs a takeover.
  const lease = { now: 'holder' in initial ? all(initial) : initial }
  const claimLanes = vi.fn(async (_id: string, want: Lane[], opts?: { takeOver?: boolean }) => {
    const next = { ...lease.now }
    for (const l of want) if (opts?.takeOver || next[l].holder !== 'other') next[l] = ME
    lease.now = next
    return lease.now
  })
  const getLanes = vi.fn(async () => lease.now)
  const releaseLanes = vi.fn(async (_id: string, lanes: Lane[] = BOTH) => {
    const next = { ...lease.now }
    for (const l of lanes) if (next[l].holder === 'me') next[l] = NOBODY
    lease.now = next
  })
  const repo = {
    claimLanes, getLanes, releaseLanes,
    onTrackerChange: (cb: () => void) => { nudges.add(cb); return () => nudges.delete(cb) },
    listThanks: async () => hearts.slice(),
    setThanks: vi.fn(async (_id: string, on: boolean) => {
      hearts.splice(0, hearts.length, ...hearts.filter((h) => !h.mine), ...(on ? [{ gameId: 'g1', name: null, mine: true, createdAt: 'x' }] : []))
      subs.forEach((f) => f())
    }),
    getGame: async () => game,
    saveGame: async (g: any) => (game = { ...game, ...g }),
    listEvents: async () => events.filter((e) => !e.deletedAt),
    addEvent: async (_: string, e: any) => { const ev = { ...e, id: `e${++n}`, createdAt: new Date(Date.now() + n).toISOString() }; events.push(ev); return ev },
    undoEvent: async (id: string) => { events.find((e) => e.id === id)!.deletedAt = 'x' },
    subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb) },
    onSyncState: (cb: any) => { cb('offline', 2); return () => {} },
  } as unknown as Repository
  return {
    repo, events, lease, claimLanes, getLanes, releaseLanes, hearts,
    /** Another parent gave a heart. */
    giveHeart: (name: string | null) => { hearts.push({ gameId: 'g1', name, mine: false, createdAt: `2026-01-01T00:00:${String(hearts.length).padStart(2, '0')}Z` }); subs.forEach((f) => f()) },
    notify: () => subs.forEach((f) => f()),
    nudge: () => nudges.forEach((f) => f()),
    getGame: () => game,
    /** Another phone changed the game (e.g. the tracker started or ended it) and it synced down here. */
    remoteStatus: (status: Game['status']) => { game = { ...game, status } },
    /** Another phone recorded a tap. */
    remoteTap: (category: StatEvent['category'], period = 1) => {
      const base = { id: `r${++n}`, gameId: 'g1', period, createdAt: new Date(Date.now() + n).toISOString() }
      events.push((category === 'duel' ? { ...base, category, outcome: 'won' } : category === 'box_entry' ? { ...base, category, outcome: 'shot' } : { ...base, category, outcome: 'clean', ballType: 'through_ball' }) as StatEvent)
    },
  }
}

/** Renders the tracker and waits until the server has said who holds the game (the buttons are off until then). */
async function setup(status?: Game['status'], initial?: GameTracker | GameLanes) {
  const f = setupNoWait(status, initial)
  await screen.findByText('vs Rovers')
  await waitFor(() => expect(f.claimLanes).toHaveBeenCalled())
  await act(async () => {})
  return f
}

function setupNoWait(status?: Game['status'], initial?: GameTracker | GameLanes, tweak?: (f: ReturnType<typeof fakeRepo>) => void) {
  const f = fakeRepo(status, initial)
  tweak?.(f)
  const view = render(
    <RepoContext.Provider value={f.repo}>
      <MemoryRouter initialEntries={['/games/g1/track']}>
        <Routes>
          <Route path="/games/:id/track" element={<TrackerPage />} />
          <Route path="/games/:id" element={<div>SUMMARY</div>} />
        </Routes>
      </MemoryRouter>
    </RepoContext.Provider>,
  )
  return { ...f, unmount: view.unmount }
}

beforeEach(() => { (navigator as any).vibrate = () => true })
afterEach(cleanup)

describe('TrackerPage', () => {
  it('creates events and updates tallies', async () => {
    const f = await setup()
    fireEvent.click(screen.getByLabelText('Duel won'))
    fireEvent.click(screen.getByLabelText('Duel won'))
    fireEvent.click(screen.getByLabelText('Duel lost'))
    expect(screen.getByTestId('duel-tally').textContent).toContain('2 of 3 · 67%')
    fireEvent.click(screen.getByText(/^Long ball/))
    fireEvent.click(screen.getByLabelText('First contact miss'))
    fireEvent.click(screen.getByLabelText('Box entry, no shot'))
    await waitFor(() => expect(f.events).toHaveLength(5))
    expect(f.events[3]).toMatchObject({ category: 'first_contact', outcome: 'miss', ballType: 'long_ball', period: 1 })
    expect(f.events[4]).toMatchObject({ category: 'box_entry', outcome: 'no_shot' })
    expect(screen.getByTestId('contact-tally').textContent).toContain('0 of 1 · 0%')
    expect(screen.getByRole('status', { name: /Offline · 2 pending/ })).toBeTruthy()
  })

  it('records the selected period', async () => {
    const f = await setup()
    fireEvent.click(screen.getByText('2nd half'))
    fireEvent.click(screen.getByLabelText('Box entry with shot'))
    await waitFor(() => expect(f.events[0]?.period).toBe(2))
  })

  it('undoes the last event and individual events', async () => {
    const f = await setup()
    fireEvent.click(screen.getByLabelText('Duel won'))
    fireEvent.click(screen.getByLabelText('Duel lost'))
    await waitFor(() => expect(f.events).toHaveLength(2), { timeout: 4000 }) // generous: this file is slow when the whole suite runs
    fireEvent.click(screen.getByLabelText('Undo last: 1v1 · Lost'))
    await waitFor(() => expect(f.events[1].deletedAt).toBeTruthy(), { timeout: 4000 })
    expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1 · 100%')
    expect(screen.getAllByText('Undid 1v1 · Lost').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Undo 1v1 · Won'))
    await waitFor(() => expect(f.events[0].deletedAt).toBeTruthy(), { timeout: 4000 })
    expect(screen.getByTestId('duel-tally').textContent).toContain('No taps yet')
  })

  it('refreshes on remote events', async () => {
    const f = await setup()
    f.events.push({ id: 'r1', gameId: 'g1', category: 'duel', outcome: 'won', period: 1, createdAt: new Date().toISOString() })
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1'))
  })

  it('starts a scheduled game and ends it with confirmation', async () => {
    const f = await setup('scheduled')
    fireEvent.click(await screen.findByText(/Start game/))
    await waitFor(() => expect(f.getGame().status).toBe('live'))
    fireEvent.click(await screen.findByText('End game'))
    fireEvent.click(screen.getAllByText('End game')[1])
    await screen.findByText('SUMMARY')
    expect(f.getGame().status).toBe('final')
  })
})

const btn = (label: string) => screen.getByLabelText(label) as HTMLButtonElement
const DEFENSE_BUTTONS = ['Duel won', 'Duel lost', 'First contact clean', 'First contact miss']
const OFFENSE_BUTTONS = ['Box entry with shot', 'Box entry, no shot']
const TAP_BUTTONS = [...DEFENSE_BUTTONS, ...OFFENSE_BUTTONS]
const radio = (name: RegExp) => screen.getByRole('radio', { name })
const allDisabled = (labels: string[]) => labels.every((l) => btn(l).disabled)
const allEnabled = (labels: string[]) => labels.every((l) => !btn(l).disabled)
const lanesList = () => screen.getByRole('list', { name: 'Who is tracking what' })

describe('one tracker per lane', () => {
  it('starts out tracking everything when nobody else has the game', async () => {
    const f = await setup()
    expect(screen.getByText(/Tracking everything/)).toBeTruthy()
    expect(f.claimLanes).toHaveBeenCalledWith('g1', BOTH)
    expect(radio(/^Everything/).getAttribute('aria-checked')).toBe('true')
    expect(allEnabled(TAP_BUTTONS)).toBe(true)
    expect(screen.queryByText(/Another parent/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Who is tracking what' })).toBeNull() // nobody else is around: no clutter
  })

  it('is view-only when another parent holds both lanes, and says who and how recently', async () => {
    const f = await setup('live', OTHER)
    expect(screen.getByText('Another parent is tracking everything')).toBeTruthy()
    expect(screen.getByText(/Active 10s ago/)).toBeTruthy()
    expect(screen.getByText(/Watching/)).toBeTruthy()
    for (const l of TAP_BUTTONS) { expect(btn(l).disabled).toBe(true); fireEvent.click(btn(l)) }
    expect(f.events).toHaveLength(0)
    expect(screen.queryByText('End game')).toBeNull()
    expect(screen.queryByLabelText(/Undo last/)).toBeNull()
    expect(f.releaseLanes).not.toHaveBeenCalled() // never held them, so nothing to hand back
  })

  it('names the tracker in the banner, the takeover confirm and the takeover notice when they set a name', async () => {
    const f = await setup('live', all(sam()))
    expect(screen.getByText('Sam is tracking everything')).toBeTruthy()
    fireEvent.click(radio(/^Everything/))
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Sam is tracking everything/)
    fireEvent.click(screen.getByText('Not now'))
    f.lease.now = all(ME)
    await act(async () => { f.nudge() })
    await screen.findByText(/Tracking everything/)
    f.lease.now = all({ holder: 'other', idleSeconds: 1, name: 'Priya' })
    await act(async () => { f.nudge() })
    expect((await screen.findAllByText('Priya took over everything')).length).toBeGreaterThan(0)
  })

  it("can't start a scheduled game it isn't tracking", async () => {
    await setup('scheduled', OTHER)
    expect(screen.queryByText(/Start game/)).toBeNull()
  })

  it("shows the other parent's taps live but gives viewers no Undo", async () => {
    const f = await setup('live', OTHER)
    f.remoteTap('duel')
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1'))
    expect(screen.queryByLabelText('Undo 1v1 · Won')).toBeNull()
  })

  it('takes over only after confirming, then can tap', async () => {
    const f = await setup('live', OTHER)
    fireEvent.click(radio(/^Everything/))
    expect(screen.getByRole('alertdialog').textContent).toMatch(/active 10s ago/)
    fireEvent.click(screen.getByText('Not now'))
    expect(f.lease.now.defense.holder).toBe('other') // asking is not taking
    expect(f.claimLanes).toHaveBeenCalledTimes(1)

    fireEvent.click(radio(/^Everything/))
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
    await waitFor(() => expect(f.claimLanes).toHaveBeenLastCalledWith('g1', BOTH, { takeOver: true }))
    await screen.findByText(/Tracking everything/)
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
  })

  it('offers Start tracking, with no confirmation, once the other parent hands the game back', async () => {
    const f = await setup('live', OTHER)
    f.lease.now = all(NOBODY)
    await act(async () => { f.nudge() }) // realtime: they released it
    await screen.findByText('Nobody is tracking right now')
    fireEvent.click(screen.getByText('Start tracking'))
    await screen.findByText(/Tracking everything/)
    expect(f.claimLanes).toHaveBeenLastCalledWith('g1', BOTH, { takeOver: false })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('tells the old tracker when someone takes over, and keeps their taps', async () => {
    const f = await setup()
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
    f.lease.now = all(OTHER)
    await act(async () => { f.nudge() })
    await screen.findByText(/Your taps so far are saved/)
    expect(screen.getAllByText('Another parent took over everything').length).toBeGreaterThan(0)
    for (const l of TAP_BUTTONS) expect(btn(l).disabled).toBe(true)
    expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1') // still counted
    expect(f.events).toHaveLength(1)
  })

  it('renews its lease on a timer, but a realtime nudge only looks (claiming from a nudge would echo forever)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const f = await setup()
      const claims = f.claimLanes.mock.calls.length
      await act(async () => { f.nudge(); f.nudge() })
      expect(f.claimLanes.mock.calls.length).toBe(claims)
      expect(f.getLanes).toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_TICK_MS) })
      expect(f.claimLanes.mock.calls.length).toBe(claims + 1)
      expect(f.claimLanes).toHaveBeenLastCalledWith('g1', BOTH) // renews exactly the lanes it holds
    } finally { vi.useRealTimers() }
  })

  it('keeps tracking, quietly renewing, if the server just says nobody holds it (not the same as being taken over)', async () => {
    const f = await setup()
    f.lease.now = all(NOBODY) // e.g. released by another tab of the same parent
    await act(async () => { f.nudge() })
    await waitFor(() => expect(f.lease.now.defense.holder).toBe('me'))
    expect(btn('Duel won').disabled).toBe(false)
    expect(screen.queryByText(/Another parent/)).toBeNull()
  })

  it('hands the lanes back when the parent leaves the screen', async () => {
    const f = await setup()
    f.unmount()
    expect(f.releaseLanes).toHaveBeenCalledWith('g1', BOTH)
  })

  it('hands the lanes back when the game ends', async () => {
    const f = await setup()
    fireEvent.click(await screen.findByText('End game'))
    fireEvent.click(screen.getAllByText('End game')[1])
    await screen.findByText('SUMMARY')
    expect(f.releaseLanes).toHaveBeenCalledWith('g1', BOTH)
  })

  it('a watcher sees the game go live, then final, without reloading, and is never offered Start tracking on a finished game', async () => {
    const f = await setup('scheduled', OTHER)
    expect(screen.getByText(/Not started/)).toBeTruthy()
    f.remoteStatus('live')
    await act(async () => { f.notify() })
    await screen.findByText(/Live/)

    f.lease.now = all(NOBODY) // the tracker ends the game and hands it back...
    f.remoteStatus('final')
    await act(async () => { f.notify(); f.nudge() })
    await screen.findByText(/Game is final/)
    expect(screen.queryByText('Start tracking')).toBeNull()
    expect(screen.queryByText(/Nobody is tracking/)).toBeNull()
    expect(screen.queryByText(/Another parent/)).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'What you track' })).toBeNull()
    for (const l of TAP_BUTTONS) expect(btn(l).disabled).toBe(true)
  })

  it('never claims a game that is already final', async () => {
    const f = setupNoWait('final', OTHER)
    await screen.findByText('vs Rovers')
    await act(async () => {})
    expect(f.claimLanes).not.toHaveBeenCalled()
    expect(screen.getByText(/Game is final/)).toBeTruthy()
    expect(screen.queryByText(/Another parent/)).toBeNull()
  })
})

describe('splitting the game between phones', () => {
  it('a second phone picks up the lane the first one is not tracking, and its stats come first', async () => {
    await setup('live', { defense: sam(), offense: NOBODY })
    expect(screen.getByText(/Tracking offense/)).toBeTruthy()
    expect(allEnabled(OFFENSE_BUTTONS)).toBe(true)
    expect(allDisabled(DEFENSE_BUTTONS)).toBe(true)
    expect(screen.getAllByText('Sam is tracking this')).toHaveLength(2) // the 1v1 and first-contact cards
    expect(within(lanesList()).getByText(/Sam/)).toBeTruthy()
    expect(within(lanesList()).getByText('You')).toBeTruthy()
    expect(radio(/^Offense/).getAttribute('aria-checked')).toBe('true')
    // The offense card is first, so the parent on offense does not scroll past 1v1s to reach their buttons.
    const box = screen.getByTestId('box-tally'), duel = screen.getByTestId('duel-tally')
    expect(box.compareDocumentPosition(duel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Nobody is tracking right now')).toBeNull() // not a viewer: no watching banner
  })

  it('only records taps in the lane it holds', async () => {
    const f = await setup('live', { defense: sam(), offense: NOBODY })
    for (const l of DEFENSE_BUTTONS) fireEvent.click(btn(l))
    fireEvent.click(btn('Box entry with shot'))
    await waitFor(() => expect(f.events).toHaveLength(1))
    expect(f.events[0]).toMatchObject({ category: 'box_entry', outcome: 'shot' })
  })

  it('lets someone tracking everything share the work: picking Defense hands offense back at once', async () => {
    const f = await setup()
    fireEvent.click(radio(/^Defense/))
    await waitFor(() => expect(f.releaseLanes).toHaveBeenCalledWith('g1', ['offense']))
    await screen.findByText(/Tracking defense/)
    expect(allEnabled(DEFENSE_BUTTONS)).toBe(true)
    expect(allDisabled(OFFENSE_BUTTONS)).toBe(true)
    expect(screen.getByText('Nobody is tracking this yet')).toBeTruthy()
    expect(within(lanesList()).getByText('Nobody yet')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull() // giving a lane up never needs a confirmation
    // ...and taking it back, when nobody else has it, is one tap with no confirmation either
    fireEvent.click(radio(/^Everything/))
    await screen.findByText(/Tracking everything/)
    expect(f.claimLanes).toHaveBeenLastCalledWith('g1', ['offense'], { takeOver: false })
  })

  it('taking one lane from someone asks first, then takes only that lane and leaves them the other', async () => {
    const f = await setup('live', all(sam()))
    fireEvent.click(radio(/^Offense/))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toMatch(/Take over offense\?/)
    expect(dialog.textContent).toMatch(/Sam is tracking offense/)
    expect(dialog.textContent).toMatch(/Sam keeps defense/)
    expect(f.claimLanes).toHaveBeenCalledTimes(1) // asking is not taking
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
    await waitFor(() => expect(f.claimLanes).toHaveBeenLastCalledWith('g1', ['offense'], { takeOver: true }))
    await screen.findByText(/Tracking offense/)
    expect(f.lease.now.defense.holder).toBe('other') // Sam still has defense
    expect(allEnabled(OFFENSE_BUTTONS)).toBe(true)
    expect(allDisabled(DEFENSE_BUTTONS)).toBe(true)
  })

  it('when someone takes one of your lanes you keep the other, and are told', async () => {
    const f = await setup()
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
    f.lease.now = { defense: ME, offense: { holder: 'other', idleSeconds: 1, name: 'Priya' } }
    await act(async () => { f.nudge() })
    expect((await screen.findAllByText('Priya took over offense')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Tracking defense/)).toBeTruthy()
    expect(allEnabled(DEFENSE_BUTTONS)).toBe(true)
    expect(allDisabled(OFFENSE_BUTTONS)).toBe(true)
    expect(screen.queryByText(/Your taps so far are saved/)).toBeNull() // still tracking: this is not the watching banner
    expect(screen.getByText('Priya is tracking this')).toBeTruthy()
    expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1')
  })

  it('offers a lane that someone let go of, with no confirmation', async () => {
    const f = await setup('live', { defense: sam(), offense: NOBODY })
    expect(radio(/^Offense/).getAttribute('aria-checked')).toBe('true')
    f.lease.now = { defense: NOBODY, offense: ME } // Sam leaves the game
    await act(async () => { f.nudge() })
    await waitFor(() => expect(within(lanesList()).getByText('Nobody yet')).toBeTruthy())
    fireEvent.click(radio(/^Everything/))
    await screen.findByText(/Tracking everything/)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(allEnabled(TAP_BUTTONS)).toBe(true)
  })

  it('a watcher is offered just the lane that opens up', async () => {
    const f = await setup('live', all(sam()))
    f.lease.now = { defense: sam(), offense: NOBODY } // Sam hands offense to whoever is next
    await act(async () => { f.nudge() })
    await screen.findByText('Sam is tracking defense')
    expect(screen.getByText(/Offense is open/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Track offense' }))
    await screen.findByText(/Tracking offense/)
    expect(f.claimLanes).toHaveBeenLastCalledWith('g1', ['offense'], { takeOver: false })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it("Undo takes back your own last tap, never the other phone's", async () => {
    const f = await setup('live', { defense: sam(), offense: NOBODY })
    fireEvent.click(btn('Box entry with shot'))
    await waitFor(() => expect(f.events).toHaveLength(1))
    f.remoteTap('duel') // Sam taps after you: it is now the newest tap in the game
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1'))
    fireEvent.click(screen.getByLabelText('Undo last: Box entry · Shot'))
    await waitFor(() => expect(f.events[0].deletedAt).toBeTruthy())
    expect(f.events[1].deletedAt).toBeFalsy()
    expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1') // Sam's tap is still counted
    expect(screen.queryByLabelText('Undo 1v1 · Won')).toBeNull() // and you get no Undo on it
  })

  it('ending the game says when someone else is still tracking, since it ends for them too', async () => {
    await setup('live', { defense: sam(), offense: NOBODY })
    fireEvent.click(await screen.findByText('End game'))
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Sam is tracking defense too, and ending the game ends it for them/)
  })

  it('mentions splitting the work, but only to someone tracking everything alone, before the first tap', async () => {
    await setup()
    expect(screen.getByText(/Tracking on your own is fine/)).toBeTruthy()
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(screen.queryByText(/Tracking on your own is fine/)).toBeNull())
  })
})

describe('which half each phone records in', () => {
  const seeded = (period: number) => (f: ReturnType<typeof fakeRepo>) => f.remoteTap('duel', period)

  it('a phone that opens the game late starts in the half the game is in', async () => {
    setupNoWait('live', ME, seeded(2))
    await screen.findByText('vs Rovers')
    await waitFor(() => expect(screen.getByText('2nd half').getAttribute('aria-pressed')).toBe('true'))
    expect(screen.queryByText(/Moved to the 2nd half/)).toBeNull() // that is where it started, not a surprise
  })

  it('moves up when another phone records in a later half, and can still go back by hand', async () => {
    const f = await setup('live', { defense: sam(), offense: NOBODY })
    expect(screen.getByText('1st half').getAttribute('aria-pressed')).toBe('true')
    f.remoteTap('duel', 2)
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByText('2nd half').getAttribute('aria-pressed')).toBe('true'))
    expect((await screen.findAllByText(/Moved to the 2nd half/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('1st half'))
    f.remoteTap('duel', 2) // more of the same half is not news: stay put
    await act(async () => { f.notify() })
    await act(async () => {})
    expect(screen.getByText('1st half').getAttribute('aria-pressed')).toBe('true')
  })

  it('records into the half it is showing', async () => {
    const f = await setup('live', { defense: sam(), offense: NOBODY })
    f.remoteTap('duel', 2)
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByText('2nd half').getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(btn('Box entry with shot'))
    await waitFor(() => expect(f.events.at(-1)).toMatchObject({ category: 'box_entry', period: 2 }))
  })
})

describe('a bad connection never stops a parent tracking', () => {
  it('carries on tracking everything when the server can not be reached', async () => {
    const f = setupNoWait('live', ME, (x) => x.claimLanes.mockRejectedValue(new Error('Failed to fetch')))
    await screen.findByText('vs Rovers')
    await waitFor(() => expect(btn('Duel won').disabled).toBe(false))
    expect(allEnabled(TAP_BUTTONS)).toBe(true)
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
  })

  it('unlocks the buttons after a few seconds if the check is just slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const f = setupNoWait('live', ME, (x) => x.claimLanes.mockReturnValue(new Promise<GameLanes>(() => {})))
      await screen.findByText('vs Rovers')
      expect(btn('Duel won').disabled).toBe(true) // still checking
      await act(async () => { await vi.advanceTimersByTimeAsync(CLAIM_WAIT_MS + 50) })
      expect(btn('Duel won').disabled).toBe(false)
      fireEvent.click(btn('Duel won'))
      await waitFor(() => expect(f.events).toHaveLength(1))
    } finally { vi.useRealTimers() }
  })

  it("if a slow check later finds someone else was already tracking, switches to watching (and doesn't claim they 'took over')", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let answer!: (t: GameLanes) => void
      setupNoWait('live', ME, (x) => x.claimLanes.mockReturnValue(new Promise<GameLanes>((r) => { answer = r })))
      await screen.findByText('vs Rovers')
      await act(async () => { await vi.advanceTimersByTimeAsync(CLAIM_WAIT_MS + 50) })
      expect(btn('Duel won').disabled).toBe(false)
      await act(async () => { answer(all(OTHER)) })
      await screen.findByText('Another parent is tracking everything')
      expect(screen.getAllByText('Another parent is already tracking everything').length).toBeGreaterThan(0)
      expect(screen.queryByText(/took over/)).toBeNull()
      expect(btn('Duel won').disabled).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('says so when a takeover can not reach the server, and stays a viewer', async () => {
    const f = await setup('live', OTHER)
    f.claimLanes.mockRejectedValue(new Error('Failed to fetch'))
    fireEvent.click(radio(/^Everything/))
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
    await screen.findByText(/Could not reach the server/)
    expect(btn('Duel won').disabled).toBe(true)
  })
})

describe('thanks: a heart for whoever tracked the game', () => {
  const heartBtn = () => screen.queryByRole('button', { name: /^Thanks/ }) as HTMLButtonElement | null

  it('the parent tracking sees who thanked them but has no heart to give, and nothing at all before the first one', async () => {
    const f = await setup('live', ME)
    expect(heartBtn()).toBeNull()
    expect(screen.queryByText(/Thanked by/)).toBeNull()
    await act(async () => { f.giveHeart('Sam') })
    expect(await screen.findByText('Thanked by Sam')).toBeTruthy()
    await act(async () => { f.giveHeart(null) })
    expect(await screen.findByText('Thanked by Sam and a parent')).toBeTruthy()
    expect(heartBtn()).toBeNull()
    expect(btn('Duel won').disabled).toBe(false) // the taps are untouched
  })

  it('a parent watching can give and take back a heart, and the hearts never count as taps', async () => {
    const f = await setup('live', OTHER)
    const b = heartBtn()!
    expect(b.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(b)
    await waitFor(() => expect(heartBtn()!.getAttribute('aria-pressed')).toBe('true'))
    expect(f.hearts).toHaveLength(1)
    expect(await screen.findByText('Thanked by You')).toBeTruthy()
    fireEvent.click(heartBtn()!)
    await waitFor(() => expect(heartBtn()!.getAttribute('aria-pressed')).toBe('false'))
    expect(f.events).toHaveLength(0)
  })

  it('is not offered before the game has started, and is offered to everyone once it is final', async () => {
    await setup('scheduled', ME)
    expect(heartBtn()).toBeNull()
    cleanup()
    setupNoWait('final', OTHER) // a finished game is never claimed, so there is no claim to wait for
    await screen.findByText('vs Rovers')
    expect(heartBtn()).toBeTruthy()
  })
})

describe('stat guide', () => {
  it('explains each stat from an ⓘ on its card without recording a tap', async () => {
    const f = await setup()
    for (const [name, tab] of [['About 1v1s', '1v1s'], ['About First contact', 'First contact'], ['About Box entries', 'Box entries']] as const) {
      fireEvent.click(screen.getByRole('button', { name }))
      const dialog = screen.getByRole('dialog', { name: 'What each stat means' })
      expect(within(dialog).getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true')
      expect(dialog.textContent).toMatch(/Undo button/) // on the tracker, so mistakes are covered
      fireEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 }) // the sheet slides away first (slower when the whole suite is running)
    }
    expect(f.events).toHaveLength(0)
    expect(screen.getByTestId('duel-tally').textContent).toContain('No taps yet')
  })

  it('stays available to someone who is only watching', async () => {
    await setup('live', OTHER)
    expect(btn('Duel won').disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'About First contact' }))
    expect(screen.getByRole('dialog', { name: 'What each stat means' })).toBeTruthy()
  })
})

