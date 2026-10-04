// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Game, StatEvent } from '../../types'
import type { Repository } from '../../data/repository'
import { RepoContext } from '../../data/context'
import GameSummaryPage from './GameSummaryPage'
import SeasonPage from './SeasonPage'

afterEach(cleanup)
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never

const mkGame = (id: string, opponent: string, date: string, status: Game['status'] = 'final'): Game =>
  ({ id, teamId: 't', opponent, date, home: true, periods: 2, status, createdAt: '', updatedAt: '' })
let n = 0
const ev = (gameId: string, category: string, outcome: string, extra: object = {}, period = 1) =>
  ({ id: `e${n++}`, gameId, category, outcome, period, createdAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`, ...extra }) as StatEvent

function fakeRepo(games: Game[], events: StatEvent[]): Repository {
  const notImpl = () => { throw new Error('nope') }
  return {
    getTeam: async () => null, createTeam: notImpl, joinTeam: notImpl,
    listGames: async () => games, getGame: async (id: string) => games.find((g) => g.id === id) ?? null,
    saveGame: notImpl, deleteGame: notImpl,
    listEvents: async (id: string) => events.filter((e) => e.gameId === id), listAllEvents: async () => events,
    addEvent: notImpl, undoEvent: notImpl, subscribe: () => () => {}, onSyncState: () => () => {},
  } as unknown as Repository
}

const renderGame = (repo: Repository, id: string) => render(
  <RepoContext.Provider value={repo}><MemoryRouter initialEntries={[`/games/${id}`]}>
    <Routes><Route path="/games/:id" element={<GameSummaryPage />} /></Routes></MemoryRouter></RepoContext.Provider>)

describe('GameSummaryPage', () => {
  it('shows hero stats, takeaways and continue link for live game', async () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) => ev('g1', 'duel', i < 4 ? 'won' : 'lost')),
      ev('g1', 'first_contact', 'clean', { ballType: 'long_ball' }),
      ev('g1', 'box_entry', 'no_shot', {}, 2),
    ]
    renderGame(fakeRepo([mkGame('g1', 'Bears', '2026-01-01', 'live')], events), 'g1')
    expect((await screen.findAllByText('67%')).length).toBeGreaterThan(0)
    expect(screen.getByText('4 of 6 1v1s')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue tracking' }).getAttribute('href')).toBe('/games/g1/track')
    expect(screen.getByText(/Small sample/)).toBeTruthy()
  })
  it('draws every live event on the game map and skips undone ones', async () => {
    const events = [
      ev('g1', 'duel', 'won'), ev('g1', 'duel', 'lost'), ev('g1', 'first_contact', 'clean', { ballType: 'through_ball' }),
      ev('g1', 'box_entry', 'shot'), ev('g1', 'box_entry', 'no_shot', { deletedAt: '2026-01-01T01:00:00Z' }),
    ]
    const { container } = renderGame(fakeRepo([mkGame('g1', 'Bears', '2026-01-01')], events), 'g1')
    const map = await screen.findByRole('img', { name: /Game map/ })
    expect(map.getAttribute('aria-label')).toBe('Game map, simulated positions. Defending end: 2 1v1s, 1 first contacts. Attacking end: 1 box entries.')
    expect(container.querySelectorAll('svg.field-map .mk')).toHaveLength(4)
    expect(container.querySelectorAll('svg.field-map .mk.pos')).toHaveLength(3)
    expect(screen.getByText(/each dot is placed at random/)).toBeTruthy()
  })
  it('narrows the game map to one half without moving any dot, and labels quarters as Q1-Q4', async () => {
    const events = [
      ev('g1', 'duel', 'won'), ev('g1', 'duel', 'lost', {}, 2), ev('g1', 'first_contact', 'clean', { ballType: 'through_ball' }),
      ev('g1', 'box_entry', 'shot'), ev('g1', 'box_entry', 'no_shot', {}, 2),
    ]
    const { container, unmount } = renderGame(fakeRepo([mkGame('g1', 'Bears', '2026-01-01')], events), 'g1')
    await screen.findByRole('img', { name: /Game map/ })
    const spots = () => Array.from(container.querySelectorAll('svg.field-map .mk')).map((m) => m.parentElement!.getAttribute('transform'))
    const whole = spots()
    expect(whole).toHaveLength(5)
    expect(screen.getByRole('radio', { name: 'Whole game' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: '2nd half' }))
    expect(screen.getByRole('img', { name: /Game map, simulated positions \(2nd half\)\. Defending end: 1 1v1s, 0 first contacts\. Attacking end: 1 box entries/ })).toBeTruthy()
    const second = spots()
    expect(second).toHaveLength(2)
    for (const t of second) expect(whole).toContain(t)

    fireEvent.click(screen.getByRole('radio', { name: '1st half' }))
    expect(spots()).toHaveLength(3)
    fireEvent.click(screen.getByRole('radio', { name: 'Whole game' }))
    expect(spots()).toEqual(whole)

    unmount()
    renderGame(fakeRepo([{ ...mkGame('g1', 'Bears', '2026-01-01'), periods: 4 }], events), 'g1')
    await screen.findByRole('img', { name: /Game map/ })
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['All', 'Q1', 'Q2', 'Q3', 'Q4'])
  })
  it('handles zero events gracefully and hides continue for final', async () => {
    renderGame(fakeRepo([mkGame('g1', 'Bears', '2026-01-01')], []), 'g1')
    await screen.findByText('vs Bears')
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Continue tracking' })).toBeNull()
    expect(screen.getByText('No stats were recorded for this game yet.')).toBeTruthy()
  })
  it('copies summary when Web Share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderGame(fakeRepo([mkGame('g1', 'Bears', '2026-01-01')], []), 'g1')
    fireEvent.click(await screen.findByRole('button', { name: 'Share summary' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(await screen.findByText('Summary copied to clipboard.')).toBeTruthy()
  })
  it('shows not found', async () => {
    renderGame(fakeRepo([], []), 'zzz')
    expect(await screen.findByText('Game not found.')).toBeTruthy()
  })
})

const renderSeason = (repo: Repository) => render(
  <RepoContext.Provider value={repo}><MemoryRouter><SeasonPage /></MemoryRouter></RepoContext.Provider>)

describe('SeasonPage', () => {
  it('empty state', async () => {
    renderSeason(fakeRepo([], []))
    expect(await screen.findByText('No stats yet')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Export all events/ }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('aggregates, lists games, chart alt text, callouts', async () => {
    const games = [mkGame('g1', 'Bears', '2026-01-01'), mkGame('g2', 'Lions', '2026-01-08')]
    const events = [
      ...Array.from({ length: 4 }, (_, i) => ev('g1', 'duel', i < 1 ? 'won' : 'lost')),
      ...Array.from({ length: 4 }, () => ev('g2', 'duel', 'won')),
    ]
    renderSeason(fakeRepo(games, events))
    expect(await screen.findByText('Season')).toBeTruthy()
    expect(screen.getByText('63%')).toBeTruthy() // 5 of 8
    expect(screen.getByRole('link', { name: 'Lions' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Defensive 1v1s won by game.*Jan 1 vs Bears: 25%/ })).toBeTruthy()
    expect(screen.getByText(/best vs Lions \(100%/)).toBeTruthy()
    expect(screen.getByText(/toughest vs Bears \(25%/)).toBeTruthy()
  })
})
