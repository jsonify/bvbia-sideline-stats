import type { ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight'
import { useTeam } from './useTeam'
import { TeamBar } from './TeamBar'

/** Redirects to /welcome when this device has no team yet. */
export function RequireTeam({ children }: { children: ReactNode }) {
  const { team } = useTeam()
  if (team === undefined) return <div className="ss-loading" role="status">Loading…</div>
  if (team === null) return <Navigate to="/welcome" replace />
  return <>{children}</>
}

const tabs = [
  { to: '/', label: 'Games', end: true, icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 5l3.5 2.5-1.3 4h-4.4l-1.3-4z' },
  { to: '/season', label: 'Season', end: false, icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
  { to: '/teams', label: 'Teams', end: false, icon: 'M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1m8-9a3 3 0 100-6 3 3 0 000 6zm8 9v-1a3 3 0 00-2-2.8M17 4.2a3 3 0 010 5.6' },
  { to: '/settings', label: 'Settings', end: false, icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z' },
]

export function Shell() {
  const { pathname } = useLocation()
  const current = tabs.find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)))?.to // same rule NavLink uses for .active
  const hideNav = /\/track$|\/edit$|^\/games\/new$/.test(pathname)
  return (
    <RequireTeam>
      <div className={'ss-shell' + (hideNav ? ' ss-no-nav' : '')}>
        <div className="ss-content">
          {!hideNav && <TeamBar />}
          <Outlet />
        </div>
        {!hideNav && (
          <nav className="ss-nav" aria-label="Main">
            <Highlight controlledItems value={current ?? null} click={false} className="ss-nav-pill" transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
              {tabs.map((t) => (
                <HighlightItem key={t.to} value={t.to} className="ss-tab-item">
                  <NavLink to={t.to} end={t.end} className="ss-tab">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
                    <span>{t.label}</span>
                  </NavLink>
                </HighlightItem>
              ))}
            </Highlight>
          </nav>
        )}
      </div>
    </RequireTeam>
  )
}
