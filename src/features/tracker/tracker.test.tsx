import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RepoContext } from '../../data/context'
import type { GameTracker, Repository } from '../../data/repository'
import type { Game, StatEvent } from '../../types'
import TrackerPage from './TrackerPage'
import { CLAIM_WAIT_MS, LEASE_TICK_MS } from './useTracker'

const ME: GameTracker = { holder: 'me', idleSeconds: 0, name: null }
const OTHER: GameTracker = { holder: 'other', idleSeconds: 12, name: null }
const NOBODY: GameTracker = { holder: 'none', idleSeconds: null, name: null }

function fakeRepo(status: Game['status'] = 'live', initial: GameTracker = ME) {
  let game: Game = { id: 'g1', teamId: 't', opponent: 'Rovers', date: '2026-01-01', home: true, periods: 2, status, createdAt: '', updatedAt: '' }
  const events: StatEvent[] = []
  const subs = new Set<() => void>()
  const nudges = new Set<() => void>()
  let n = 0
  // Who holds the game on the server. Free/mine claims succeed, someone else's live lease needs a takeover.
  const lease = { now: initial }
  const claimTracker = vi.fn(async (_id: string, opts?: { takeOver?: boolean }) => {
    if (opts?.takeOver || lease.now.holder !== 'other') lease.now = ME
    return lease.now
  })
  const getTracker = vi.fn(async () => lease.now)
  const releaseTracker = vi.fn(async () => {})
  const repo = {
    claimTracker, getTracker, releaseTracker,
    onTrackerChange: (cb: () => void) => { nudges.add(cb); return () => nudges.delete(cb) },
    getGame: async () => game,
    saveGame: async (g: any) => (game = { ...game, ...g }),
    listEvents: async () => events.filter((e) => !e.deletedAt),
    addEvent: async (_: string, e: any) => { const ev = { ...e, id: `e${++n}`, createdAt: new Date(Date.now() + n).toISOString() }; events.push(ev); return ev },
    undoEvent: async (id: string) => { events.find((e) => e.id === id)!.deletedAt = 'x' },
    subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb) },
    onSyncState: (cb: any) => { cb('offline', 2); return () => {} },
  } as unknown as Repository
  return {
    repo, events, lease, claimTracker, getTracker, releaseTracker,
    notify: () => subs.forEach((f) => f()),
    nudge: () => nudges.forEach((f) => f()),
    getGame: () => game,
    /** Another phone changed the game (e.g. the tracker started or ended it) and it synced down here. */
    remoteStatus: (status: Game['status']) => { game = { ...game, status } },
  }
}

/** Renders the tracker and waits until the server has said who holds the game (the buttons are off until then). */
async function setup(status?: Game['status'], initial?: GameTracker) {
  const f = setupNoWait(status, initial)
  await screen.findByText('vs Rovers')
  await waitFor(() => expect(f.claimTracker).toHaveBeenCalled())
  await act(async () => {})
  return f
}

function setupNoWait(status?: Game['status'], initial?: GameTracker, tweak?: (f: ReturnType<typeof fakeRepo>) => void) {
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
    expect(screen.getByText(/Offline · 2 pending/)).toBeTruthy()
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
    await waitFor(() => expect(f.events).toHaveLength(2))
    fireEvent.click(screen.getByLabelText('Undo last: 1v1 · Lost'))
    await waitFor(() => expect(f.events[1].deletedAt).toBeTruthy())
    expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1 · 100%')
    expect(screen.getAllByText('Undid 1v1 · Lost').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Undo 1v1 · Won'))
    await waitFor(() => expect(f.events[0].deletedAt).toBeTruthy())
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
const TAP_BUTTONS = ['Duel won', 'Duel lost', 'First contact clean', 'First contact miss', 'Box entry with shot', 'Box entry, no shot']

describe('one tracker per game', () => {
  it('starts as the tracker when nobody else has the game', async () => {
    const f = await setup()
    expect(screen.getByText(/You're tracking/)).toBeTruthy()
    expect(f.claimTracker).toHaveBeenCalledWith('g1')
    expect(screen.queryByText(/Another parent/)).toBeNull()
  })

  it('is view-only when another parent holds the game, and says who and how recently', async () => {
    const f = await setup('live', OTHER)
    expect(screen.getByText('Another parent is tracking this game')).toBeTruthy()
    expect(screen.getByText(/Active 10s ago/)).toBeTruthy()
    expect(screen.getByText(/Watching/)).toBeTruthy()
    for (const l of TAP_BUTTONS) { expect(btn(l).disabled).toBe(true); fireEvent.click(btn(l)) }
    expect(f.events).toHaveLength(0)
    expect(screen.queryByText('End game')).toBeNull()
    expect(screen.queryByLabelText(/Undo last/)).toBeNull()
    expect(f.releaseTracker).not.toHaveBeenCalled() // never held it, so nothing to hand back
  })

  it('names the tracker in the banner, the takeover confirm and the takeover notice when they set a name', async () => {
    const f = await setup('live', { holder: 'other', idleSeconds: 3, name: 'Sam' })
    expect(screen.getByText('Sam is tracking this game')).toBeTruthy()
    fireEvent.click(screen.getByText('Take over tracking'))
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Sam is tracking this game/)
    fireEvent.click(screen.getByText('Keep watching'))
    f.lease.now = ME
    await act(async () => { f.nudge() })
    await screen.findByText(/You're tracking/)
    f.lease.now = { holder: 'other', idleSeconds: 1, name: 'Priya' }
    await act(async () => { f.nudge() })
    expect((await screen.findAllByText('Priya took over tracking')).length).toBeGreaterThan(0)
  })

  it("can't start a scheduled game it isn't tracking", async () => {
    await setup('scheduled', OTHER)
    expect(screen.queryByText(/Start game/)).toBeNull()
  })

  it("shows the other parent's taps live but gives viewers no Undo", async () => {
    const f = await setup('live', OTHER)
    f.events.push({ id: 'r1', gameId: 'g1', category: 'duel', outcome: 'won', period: 1, createdAt: new Date().toISOString() })
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1'))
    expect(screen.queryByLabelText('Undo 1v1 · Won')).toBeNull()
  })

  it('takes over only after confirming, then can tap', async () => {
    const f = await setup('live', OTHER)
    fireEvent.click(screen.getByText('Take over tracking'))
    expect(screen.getByRole('alertdialog').textContent).toMatch(/active 10s ago/)
    fireEvent.click(screen.getByText('Keep watching'))
    expect(f.lease.now.holder).toBe('other') // asking is not taking
    expect(f.claimTracker).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Take over tracking'))
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
    await waitFor(() => expect(f.claimTracker).toHaveBeenLastCalledWith('g1', { takeOver: true }))
    await screen.findByText(/You're tracking/)
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
  })

  it('offers Start tracking, with no confirmation, once the other parent hands the game back', async () => {
    const f = await setup('live', OTHER)
    f.lease.now = NOBODY
    await act(async () => { f.nudge() }) // realtime: they released it
    await screen.findByText('Nobody is tracking right now')
    fireEvent.click(screen.getByText('Start tracking'))
    await screen.findByText(/You're tracking/)
    expect(f.claimTracker).toHaveBeenLastCalledWith('g1', { takeOver: false })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('tells the old tracker when someone takes over, and keeps their taps', async () => {
    const f = await setup()
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
    f.lease.now = OTHER
    await act(async () => { f.nudge() })
    await screen.findByText(/Your taps so far are saved/)
    expect(screen.getAllByText('Another parent took over tracking').length).toBeGreaterThan(0)
    for (const l of TAP_BUTTONS) expect(btn(l).disabled).toBe(true)
    expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1') // still counted
    expect(f.events).toHaveLength(1)
  })

  it('renews its lease on a timer, but a realtime nudge only looks (claiming from a nudge would echo forever)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const f = await setup()
      const claims = f.claimTracker.mock.calls.length
      await act(async () => { f.nudge(); f.nudge() })
      expect(f.claimTracker.mock.calls.length).toBe(claims)
      expect(f.getTracker).toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_TICK_MS) })
      expect(f.claimTracker.mock.calls.length).toBe(claims + 1)
    } finally { vi.useRealTimers() }
  })

  it('keeps tracking, quietly renewing, if the server just says nobody holds it (not the same as being taken over)', async () => {
    const f = await setup()
    f.lease.now = NOBODY // e.g. released by another tab of the same parent
    await act(async () => { f.nudge() })
    await waitFor(() => expect(f.lease.now.holder).toBe('me'))
    expect(btn('Duel won').disabled).toBe(false)
    expect(screen.queryByText(/Another parent/)).toBeNull()
  })

  it('hands the game back when the parent leaves the screen', async () => {
    const f = await setup()
    f.unmount()
    expect(f.releaseTracker).toHaveBeenCalledWith('g1')
  })

  it('hands the game back when the game ends', async () => {
    const f = await setup()
    fireEvent.click(await screen.findByText('End game'))
    fireEvent.click(screen.getAllByText('End game')[1])
    await screen.findByText('SUMMARY')
    expect(f.releaseTracker).toHaveBeenCalledWith('g1')
  })

  it('a watcher sees the game go live, then final, without reloading, and is never offered Start tracking on a finished game', async () => {
    const f = await setup('scheduled', OTHER)
    expect(screen.getByText(/Not started/)).toBeTruthy()
    f.remoteStatus('live')
    await act(async () => { f.notify() })
    await screen.findByText(/Live/)

    f.lease.now = NOBODY // the tracker ends the game and hands it back...
    f.remoteStatus('final')
    await act(async () => { f.notify(); f.nudge() })
    await screen.findByText(/Game is final/)
    expect(screen.queryByText('Start tracking')).toBeNull()
    expect(screen.queryByText(/Nobody is tracking/)).toBeNull()
    expect(screen.queryByText(/Another parent/)).toBeNull()
    for (const l of TAP_BUTTONS) expect(btn(l).disabled).toBe(true)
  })

  it('never claims a game that is already final', async () => {
    const f = setupNoWait('final', OTHER)
    await screen.findByText('vs Rovers')
    await act(async () => {})
    expect(f.claimTracker).not.toHaveBeenCalled()
    expect(screen.getByText(/Game is final/)).toBeTruthy()
    expect(screen.queryByText(/Another parent/)).toBeNull()
  })
})

describe('a bad connection never stops a parent tracking', () => {
  it('carries on as the tracker when the server can not be reached', async () => {
    const f = setupNoWait('live', ME, (x) => x.claimTracker.mockRejectedValue(new Error('Failed to fetch')))
    await screen.findByText('vs Rovers')
    await waitFor(() => expect(btn('Duel won').disabled).toBe(false))
    fireEvent.click(btn('Duel won'))
    await waitFor(() => expect(f.events).toHaveLength(1))
  })

  it('unlocks the buttons after a few seconds if the check is just slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const f = setupNoWait('live', ME, (x) => x.claimTracker.mockReturnValue(new Promise<GameTracker>(() => {})))
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
      let answer!: (t: GameTracker) => void
      setupNoWait('live', ME, (x) => x.claimTracker.mockReturnValue(new Promise<GameTracker>((r) => { answer = r })))
      await screen.findByText('vs Rovers')
      await act(async () => { await vi.advanceTimersByTimeAsync(CLAIM_WAIT_MS + 50) })
      expect(btn('Duel won').disabled).toBe(false)
      await act(async () => { answer(OTHER) })
      await screen.findByText('Another parent is tracking this game')
      expect(screen.getAllByText('Another parent is already tracking this game').length).toBeGreaterThan(0)
      expect(screen.queryByText(/took over/)).toBeNull()
      expect(btn('Duel won').disabled).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('says so when a takeover can not reach the server, and stays a viewer', async () => {
    const f = await setup('live', OTHER)
    f.claimTracker.mockRejectedValue(new Error('Failed to fetch'))
    fireEvent.click(screen.getByText('Take over tracking'))
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
    await screen.findByText(/Could not reach the server/)
    expect(btn('Duel won').disabled).toBe(true)
  })
})
