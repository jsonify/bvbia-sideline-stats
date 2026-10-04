import { useEffect, useId, useState } from 'react'
import { useRepo } from '../../data/context'
import { heartsFor, thanksNames } from '../../lib/thanks'
import { Icon } from '../../ui'
import { useThanks } from './useThanks'
import './thanks.css'

/**
 * A heart on a game that is live or finished: "thanks to whoever tracked it". One per parent, and you can take it back.
 * `readOnly` is for the parent doing the tracking, who is the one being thanked: they see the hearts, but have none to give.
 * It never touches the stats; it is only an acknowledgement.
 */
export function ThanksHeart({ gameId, readOnly = false }: { gameId: string; readOnly?: boolean }) {
  const repo = useRepo()
  const hearts = heartsFor(useThanks(), gameId)
  const mine = hearts.some((h) => h.mine)
  const names = thanksNames(hearts)
  const hintId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!failed) return
    const t = setTimeout(() => setFailed(false), 5000)
    return () => clearTimeout(t)
  }, [failed])

  if (readOnly) {
    if (!hearts.length) return null
    return (
      <div className="th">
        <span className="th-count"><Icon name="heart" size={16} fill="currentColor" />{hearts.length}</span>
        <span className="th-names">Thanked by {names}</span>
      </div>
    )
  }

  const toggle = async () => {
    if (busy) return // the heart on screen already answered the last tap
    setBusy(true); setFailed(false)
    try { await repo.setThanks(gameId, !mine) } catch { setFailed(true) } finally { setBusy(false) }
  }

  return (
    <div className="th">
      <button type="button" className="th-btn" aria-pressed={mine} aria-busy={busy} aria-describedby={hintId} onClick={toggle}>
        <Icon name="heart" size={20} fill={mine ? 'currentColor' : 'none'} />
        Thanks
        {hearts.length > 0 && <b aria-hidden="true">{hearts.length}</b>}
      </button>
      <span className="th-names" id={hintId}>{names ? `Thanked by ${names}` : 'Say thanks to whoever tracked this game'}</span>
      {failed && <span className="th-error" role="status">Couldn't send that. Check your connection and try again.</span>}
    </div>
  )
}

/** A small heart and a count, for lists. Nothing when there are no hearts: a list never shows "0". */
export function ThanksTag({ n }: { n: number }) {
  if (n < 1) return null
  return <span className="th-tag"><Icon name="heart" size={14} fill="currentColor" />{n}<span className="sr-only"> thanks</span></span>
}
