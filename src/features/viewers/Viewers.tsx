import { Icon } from '../../ui'
import type { Game } from '../../types'
import { useViewers } from './useViewers'
import './viewers.css'

/** "3 watching now · 7 so far" on a live game, "7 followed live" on a finished one. Nothing when there's no count. */
export function Viewers({ game }: { game: Pick<Game, 'id' | 'status'> }) {
  const v = useViewers(game)
  if (!v) return null
  if (game.status === 'final') {
    if (v.followed < 1) return null
    return <p className="vw"><Icon name="eye" size={16} />{v.followed} followed live</p>
  }
  return (
    <p className="vw" role="status" aria-live="polite">
      <Icon name="eye" size={16} /><b>{v.watching}</b> watching now{v.followed > v.watching && <span> · {v.followed} so far</span>}
    </p>
  )
}
