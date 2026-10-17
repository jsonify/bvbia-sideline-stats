import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRepo } from '../../data/context'
import { isStandalone, persistStorage, setBadge } from '../../lib/pwa'

/**
 * App-level native hooks that need the router or the repository:
 * - a home-screen shortcut ("New game", "Season") or invite link opened while the app is already running brings that
 *   window forward and goes to the page (the manifest asks for focus-existing, so a plain icon tap never yanks a
 *   parent off the tracker);
 * - the icon badge counts stats still waiting to sync;
 * - saved games are kept out of the browser's storage clean-up (installed only: Firefox asks permission for it in a tab).
 */
export function LaunchHandler() {
  const navigate = useNavigate()
  const repo = useRepo()

  useEffect(() => {
    const lq = (window as any).launchQueue
    lq?.setConsumer?.((params: { targetURL?: string }) => {
      if (!params.targetURL) return
      const u = new URL(params.targetURL)
      const to = u.pathname + u.search
      if (u.origin === location.origin && to !== '/' && to !== location.pathname + location.search) navigate(to)
    })
  }, [navigate])

  useEffect(() => repo.onSyncState((_s, pending) => setBadge(pending)), [repo])
  useEffect(() => { if (isStandalone()) void persistStorage() }, [])

  return null
}
