import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RepoContext } from '../../data/context'
import type { GameThanks, Repository } from '../../data/repository'
import { ThanksHeart, ThanksTag } from './ThanksHeart'

afterEach(cleanup)

const heart = (name: string | null, mine = false, gameId = 'g1'): GameThanks => ({ gameId, name, mine, createdAt: `2026-01-01T00:00:0${name?.length ?? 0}Z`, })

/** Just the heart half of a Repository, in memory. `gate` holds a send until the test lets it go. */
function fakeRepo(initial: GameThanks[] = []) {
  let hearts = initial
  const subs = new Set<() => void>()
  const calls: boolean[] = []
  const state = { fail: false, gate: null as Promise<void> | null }
  const repo = {
    listThanks: async () => hearts,
    subscribe: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb) } },
    setThanks: vi.fn(async (gameId: string, on: boolean) => {
      calls.push(on)
      hearts = [...hearts.filter((h) => !(h.gameId === gameId && h.mine)), ...(on ? [heart('Me', true, gameId)] : [])]
      subs.forEach((f) => f()) // shown at once, like the real thing
      await state.gate
      if (state.fail) { hearts = initial; subs.forEach((f) => f()); throw new Error('offline') }
    }),
  } as unknown as Repository
  return { repo, calls, state, give: (h: GameThanks) => { hearts = [...hearts, h]; subs.forEach((f) => f()) } }
}

const show = (f: ReturnType<typeof fakeRepo>, props: { readOnly?: boolean } = {}) =>
  render(<RepoContext.Provider value={f.repo}><ThanksHeart gameId="g1" {...props} /></RepoContext.Provider>)

describe('ThanksHeart', () => {
  it('invites a thank-you when there are no hearts, and shows no count', async () => {
    show(fakeRepo())
    const btn = await screen.findByRole('button', { name: /^Thanks/ })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText('Say thanks to whoever tracked this game')).toBeTruthy()
    expect(btn.querySelector('b')).toBeNull() // never a "0"
  })

  it('gives a heart, shows it as pressed with the count and who, and takes it back', async () => {
    const f = fakeRepo([heart('Sam')])
    show(f)
    const btn = await screen.findByRole('button', { name: /^Thanks/ })
    expect(await screen.findByText('Thanked by Sam')).toBeTruthy()
    fireEvent.click(btn)
    await waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('true'))
    expect(f.calls).toEqual([true])
    expect(await screen.findByText('Thanked by You and Sam')).toBeTruthy()
    expect(btn.querySelector('b')?.textContent).toBe('2')
    fireEvent.click(btn)
    await waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('false'))
    expect(f.calls).toEqual([true, false])
    expect(await screen.findByText('Thanked by Sam')).toBeTruthy()
  })

  it('only counts the hearts on its own game', async () => {
    show(fakeRepo([heart('Sam', false, 'g2'), heart('Lee')]))
    expect(await screen.findByText('Thanked by Lee')).toBeTruthy()
    expect(screen.queryByText(/Sam/)).toBeNull()
  })

  it('ignores a second tap while the first is still being sent', async () => {
    const f = fakeRepo()
    let release!: () => void
    f.state.gate = new Promise<void>((res) => { release = res })
    show(f)
    const btn = await screen.findByRole('button', { name: /^Thanks/ })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(btn.getAttribute('aria-busy')).toBe('true'))
    await act(async () => { release() })
    await waitFor(() => expect(btn.getAttribute('aria-busy')).toBe('false'))
    expect(f.calls).toEqual([true])
  })

  it('says so when the heart could not be sent, then lets go of the message', async () => {
    const f = fakeRepo()
    f.state.fail = true
    show(f)
    const btn = await screen.findByRole('button', { name: /^Thanks/ })
    fireEvent.click(btn)
    expect((await screen.findByRole('status')).textContent).toMatch(/Couldn't send that/)
    expect(btn.getAttribute('aria-pressed')).toBe('false') // not left looking sent
    f.state.fail = false
    fireEvent.click(btn) // trying again clears the message
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    await waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('true'))
  })

  it('updates when another phone gives a heart', async () => {
    const f = fakeRepo()
    show(f)
    await screen.findByText('Say thanks to whoever tracked this game')
    act(() => f.give(heart('Priya')))
    expect(await screen.findByText('Thanked by Priya')).toBeTruthy()
  })

  describe('read-only (for the parent tracking, who is being thanked)', () => {
    it('shows nothing until someone says thanks, and never offers a button', async () => {
      const f = fakeRepo()
      const { container } = show(f, { readOnly: true })
      await act(async () => {})
      expect(container.textContent).toBe('')
      act(() => f.give(heart('Sam')))
      expect(await screen.findByText('Thanked by Sam')).toBeTruthy()
      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})

describe('ThanksTag', () => {
  it('shows a count for screen readers too, and nothing for none', () => {
    const { container, rerender } = render(<ThanksTag n={3} />)
    expect(container.textContent).toBe('3 thanks')
    rerender(<ThanksTag n={0} />)
    expect(container.textContent).toBe('')
  })
})
