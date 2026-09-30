import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RepoContext } from '../../data/context'
import type { Repository } from '../../data/repository'
import type { Game, StatEvent } from '../../types'
import TrackerPage from './TrackerPage'

function fakeRepo(status: Game['status'] = 'live') {
  let game: Game = { id: 'g1', teamId: 't', opponent: 'Rovers', date: '2026-01-01', home: true, periods: 2, status, createdAt: '', updatedAt: '' }
  const events: StatEvent[] = []
  const subs = new Set<() => void>()
  let n = 0
  const repo = {
    getGame: async () => game,
    saveGame: async (g: any) => (game = { ...game, ...g }),
    listEvents: async () => events.filter((e) => !e.deletedAt),
    addEvent: async (_: string, e: any) => { const ev = { ...e, id: `e${++n}`, createdAt: new Date(Date.now() + n).toISOString() }; events.push(ev); return ev },
    undoEvent: async (id: string) => { events.find((e) => e.id === id)!.deletedAt = 'x' },
    subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb) },
    onSyncState: (cb: any) => { cb('offline', 2); return () => {} },
  } as unknown as Repository
  return { repo, events, notify: () => subs.forEach((f) => f()), getGame: () => game }
}

function setup(status?: Game['status']) {
  const f = fakeRepo(status)
  render(
    <RepoContext.Provider value={f.repo}>
      <MemoryRouter initialEntries={['/games/g1/track']}>
        <Routes>
          <Route path="/games/:id/track" element={<TrackerPage />} />
          <Route path="/games/:id" element={<div>SUMMARY</div>} />
        </Routes>
      </MemoryRouter>
    </RepoContext.Provider>,
  )
  return f
}

beforeEach(() => { (navigator as any).vibrate = () => true })
afterEach(cleanup)

describe('TrackerPage', () => {
  it('creates events and updates tallies', async () => {
    const f = setup()
    await screen.findByText('vs Rovers')
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
    const f = setup()
    await screen.findByText('vs Rovers')
    fireEvent.click(screen.getByText('2nd half'))
    fireEvent.click(screen.getByLabelText('Box entry with shot'))
    await waitFor(() => expect(f.events[0]?.period).toBe(2))
  })

  it('undoes the last event and individual events', async () => {
    const f = setup()
    await screen.findByText('vs Rovers')
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
    const f = setup()
    await screen.findByText('vs Rovers')
    f.events.push({ id: 'r1', gameId: 'g1', category: 'duel', outcome: 'won', period: 1, createdAt: new Date().toISOString() })
    await act(async () => { f.notify() })
    await waitFor(() => expect(screen.getByTestId('duel-tally').textContent).toContain('1 of 1'))
  })

  it('starts a scheduled game and ends it with confirmation', async () => {
    const f = setup('scheduled')
    fireEvent.click(await screen.findByText(/Start game/))
    await waitFor(() => expect(f.getGame().status).toBe('live'))
    fireEvent.click(await screen.findByText('End game'))
    fireEvent.click(screen.getAllByText('End game')[1])
    await screen.findByText('SUMMARY')
    expect(f.getGame().status).toBe('final')
  })
})
