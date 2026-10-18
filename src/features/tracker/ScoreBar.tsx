import { useState } from 'react'
import type { Game, GameScore } from '../../types'
import { cleanScore } from '../../lib/score'
import { Sheet } from '../../ui'

/**
 * The score, small, in the tracker's header. Tapping it opens a sheet to log a goal the moment it goes in (two taps:
 * the score, then who scored), so nobody has to remember the score at the end. It sits above the stats, never among
 * them, and a phone that is only watching just sees it.
 */
export function ScoreBar({ game, teamName, canEdit, onChange }: {
  game: Game; teamName: string; canEdit: boolean; onChange: (side: keyof GameScore, delta: 1 | -1) => void
}) {
  const [open, setOpen] = useState(false)
  const s = cleanScore(game.score) ?? { us: 0, them: 0 }
  const us = teamName.trim() || 'Us', them = game.opponent.trim()
  const label = `Score: ${us} ${s.us}, ${them} ${s.them}`
  const board = (
    <>
      <span className="tk-sc-team us">{us}</span>
      <span className="tk-sc-team them">{them}</span>
      <b className="tk-sc-n">{s.us}<span aria-hidden="true">–</span>{s.them}</b>
    </>
  )
  if (!canEdit) return <div className="tk-score" role="status" aria-label={label}>{board}</div>

  return (
    <>
      <button type="button" className="tk-score" aria-label={`${label}. Log a goal`} onClick={() => setOpen(true)}>
        {board}<span className="tk-sc-add" aria-hidden="true">+ Goal</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Who scored?" className="score-sheet">
        {(close) => (
          <div className="tk-goal-sheet">
            <p className="tk-goal-now" aria-live="polite">{us} <b>{s.us}–{s.them}</b> {them}</p>
            <div className="tk-goal-btns">
              <button type="button" className="tk-goal-us" onClick={() => { onChange('us', 1); close() }}>⚽ {us}</button>
              <button type="button" className="tk-goal-them" onClick={() => { onChange('them', 1); close() }}>⚽ {them}</button>
            </div>
            <p className="tk-goal-fix-h">Logged one by mistake?</p>
            <div className="tk-goal-fix">
              <button type="button" disabled={s.us === 0} onClick={() => onChange('us', -1)}>− Take one off {us}</button>
              <button type="button" disabled={s.them === 0} onClick={() => onChange('them', -1)}>− Take one off {them}</button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
