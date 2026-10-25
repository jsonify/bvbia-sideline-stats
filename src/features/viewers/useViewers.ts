import { useEffect, useState } from 'react'
import { useRepo } from '../../data/context'
import type { GameViewers } from '../../data/repository'
import type { Game } from '../../types'

/** How often a phone with a live game open checks in. The server counts a phone as watching for 60 s after it does. */
export const CHECK_IN_MS = 20_000

/**
 * Who's watching a game. While a live game is open (and the screen is on) this phone counts itself in every
 * `CHECK_IN_MS`; a finished game is read once. Null for a game that hasn't started, in demo mode, or until the
 * first answer. A failed check-in keeps what was last shown: it is only a count.
 */
export function useViewers(game: Pick<Game, 'id' | 'status'> | null | undefined): GameViewers | null {
  const repo = useRepo()
  const [viewers, setViewers] = useState<GameViewers | null>(null)
  const id = game?.id
  const status = game?.status
  useEffect(() => {
    setViewers(null)
    if (!id || (status !== 'live' && status !== 'final')) return
    let live = true
    const ask = (here: boolean) => { repo.watchGame(id, here).then((v) => { if (live) setViewers(v) }, () => {}) }
    if (status === 'final') { ask(false); return () => { live = false } }
    const checkIn = () => { if (!document.hidden) ask(true) }
    checkIn()
    const timer = setInterval(checkIn, CHECK_IN_MS)
    document.addEventListener('visibilitychange', checkIn)
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', checkIn) }
  }, [repo, id, status])
  return viewers
}
