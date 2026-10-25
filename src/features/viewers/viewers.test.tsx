import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RepoContext } from '../../data/context'
import type { GameViewers, Repository } from '../../data/repository'
import { Viewers } from './Viewers'
import { CHECK_IN_MS } from './useViewers'

afterEach(() => { cleanup(); vi.useRealTimers() })

function fakeRepo(answer: () => GameViewers | null | Promise<never>) {
  const watchGame = vi.fn(async () => answer())
  return { repo: { watchGame } as unknown as Repository, watchGame }
}
const show = (repo: Repository, status: 'scheduled' | 'live' | 'final') =>
  render(<RepoContext.Provider value={repo}><Viewers game={{ id: 'g1', status }} /></RepoContext.Provider>)

describe('Viewers', () => {
  it('on a live game, checks in and shows who is watching now and so far', async () => {
    const { repo, watchGame } = fakeRepo(() => ({ watching: 3, followed: 7 }))
    show(repo, 'live')
    expect((await screen.findByRole('status')).textContent).toBe('3 watching now · 7 so far')
    expect(watchGame).toHaveBeenCalledWith('g1', true)
  })

  it('keeps checking in while the game is open, and stops when it closes', async () => {
    vi.useFakeTimers()
    const { repo, watchGame } = fakeRepo(() => ({ watching: 1, followed: 1 }))
    const view = show(repo, 'live')
    expect(watchGame).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(CHECK_IN_MS) })
    expect(watchGame).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toBe('1 watching now') // nobody else ever came: no "so far"
    view.unmount()
    vi.advanceTimersByTime(CHECK_IN_MS * 3)
    expect(watchGame).toHaveBeenCalledTimes(2)
  })

  it('on a finished game, only reads how many followed it', async () => {
    const { repo, watchGame } = fakeRepo(() => ({ watching: 0, followed: 5 }))
    show(repo, 'final')
    await screen.findByText('5 followed live')
    expect(watchGame).toHaveBeenCalledWith('g1', false)
  })

  it('shows nothing before kick-off, in demo mode, or when the count cannot be reached', async () => {
    const before = fakeRepo(() => ({ watching: 1, followed: 1 }))
    show(before.repo, 'scheduled')
    expect(before.watchGame).not.toHaveBeenCalled()
    show(fakeRepo(() => null).repo, 'live')
    show(fakeRepo(() => Promise.reject(new Error('offline'))).repo, 'live')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(screen.queryByText(/watching|followed/)).toBeNull()
  })
})
