import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { captureInstallPrompt } from '../../lib/pwa'
import { InstallCard } from './InstallCard'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const asDevice = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)

beforeAll(() => captureInstallPrompt())
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (navigator as any).standalone })

describe('InstallCard', () => {
  it('shows the Share → Add to Home Screen steps in iPhone Safari', () => {
    asDevice(IPHONE)
    render(<InstallCard />)
    expect(screen.getByText('Add to your home screen')).toBeTruthy()
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
  })

  it('says nothing in a browser that cannot install', () => {
    asDevice(ANDROID)
    const { container } = render(<InstallCard />)
    expect(container.innerHTML).toBe('')
  })

  it('is hidden once running from the home screen', () => {
    asDevice(IPHONE)
    ;(navigator as any).standalone = true
    const { container } = render(<InstallCard />)
    expect(container.innerHTML).toBe('')
  })

  it('offers the browser install dialog when Chrome allows it, and goes away once installed', async () => {
    asDevice(ANDROID)
    render(<InstallCard />)
    const prompt = vi.fn(async () => {})
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    act(() => { window.dispatchEvent(e) })
    expect(e.defaultPrevented).toBe(true) // the browser's own mini-infobar is held back
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
    expect(prompt).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Add to your home screen')).toBeNull())
  })
})
