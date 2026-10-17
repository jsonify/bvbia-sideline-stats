import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { hidesNav } from './PageTransition'

const CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * "New version ready" banner. The new service worker waits until the parent taps Update, so a deploy never reloads the
 * app under someone mid-game, and the page never asks the server for old file names the new deploy no longer has.
 * Hidden on the tracker and the game form so it can't cover a stat button; it shows again once they leave.
 */
export function AppUpdate() {
  const { pathname } = useLocation()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      // a home-screen app can stay open for days, so look for a new deploy hourly and whenever it comes back to the front
      setInterval(() => { if (navigator.onLine) void reg.update() }, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) void reg.update() })
    },
  })
  if (!needRefresh || hidesNav(pathname)) return null
  return (
    <div className="ss-update" role="status">
      <span>A new version is ready</span>
      <button type="button" className="ss-update-btn" onClick={() => void updateServiceWorker(true)}>Update</button>
    </div>
  )
}
