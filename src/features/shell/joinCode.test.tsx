import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JoinCodeCard } from './JoinCodeCard'

const nav = navigator as any
const writeText = vi.fn(async () => {})

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  delete nav.share
})
afterEach(() => { cleanup(); delete nav.share })

const card = () => render(<JoinCodeCard teamName="U10 Thunder" code="ABC234" />)

describe('JoinCodeCard', () => {
  it('shows the code, how other parents join, and the link they will get', () => {
    card()
    expect(screen.getByText('ABC234')).toBeTruthy()
    expect(screen.getByText('How other parents join')).toBeTruthy()
    expect(screen.getByText(/tap the link to open the app/i)).toBeTruthy()
    expect(screen.getByText(/paste the code/i)).toBeTruthy()
    expect(screen.getByLabelText('Invite link').textContent).toBe(`${window.location.origin}/welcome?code=ABC234`)
  })

  it('Share code sends the app link, the code and the steps in the share sheet', async () => {
    nav.share = vi.fn(async () => {})
    card()
    fireEvent.click(screen.getByRole('button', { name: 'Share code' }))
    await waitFor(() => expect(nav.share).toHaveBeenCalledTimes(1))
    const arg = nav.share.mock.calls[0][0]
    const link = `${window.location.origin}/welcome?code=ABC234`
    expect(arg.text).toContain('U10 Thunder')
    expect(arg.text).toContain(link)
    expect(arg.text).toContain('ABC234')
    expect(arg.text).toContain('Tap "Join with team code" and paste this code')
    expect(arg.url).toBeUndefined() // one body of text, so the link and the steps always arrive together, in order
    expect(writeText).not.toHaveBeenCalled()
  })

  it('without a share sheet (desktop), copies the whole invite and says to paste it', async () => {
    card()
    fireEvent.click(screen.getByRole('button', { name: 'Share code' }))
    await screen.findByText(/Invite copied/)
    const copied = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(copied).toContain(`${window.location.origin}/welcome?code=ABC234`)
    expect(copied).toContain('Tap "Join team"')
  })

  it('closing the share sheet is not an error', async () => {
    nav.share = vi.fn(async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }) })
    card()
    fireEvent.click(screen.getByRole('button', { name: 'Share code' }))
    await waitFor(() => expect(nav.share).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/Could not share/)).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to copying if the share sheet itself breaks', async () => {
    nav.share = vi.fn(async () => { throw new Error('boom') })
    card()
    fireEvent.click(screen.getByRole('button', { name: 'Share code' }))
    await screen.findByText(/Invite copied/)
  })

  it('says how to carry on when neither sharing nor copying works', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied') }) }, configurable: true })
    card()
    fireEvent.click(screen.getByRole('button', { name: 'Share code' }))
    await screen.findByText(/Could not share/)
  })

  it('Copy code copies just the code, ready to paste into the app', async () => {
    card()
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await screen.findByText('Code copied')
    expect(writeText).toHaveBeenCalledWith('ABC234')
  })
})
