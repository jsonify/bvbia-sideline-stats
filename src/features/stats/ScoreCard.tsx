import { useState } from 'react'
import { useRepo } from '../../data/context'
import type { Game, GameScore } from '../../types'
import { cleanScore, MAX_GOALS, resultOf, RESULT_WORD } from '../../lib/score'

function Stepper({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="step" role="group" aria-labelledby={id}>
      <span id={id} className="step-name">{label}</span>
      <div className="step-row">
        <button type="button" className="btn" aria-label={`One less for ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <output className="step-n" aria-live="polite">{value}</output>
        <button type="button" className="btn" aria-label={`One more for ${label}`} disabled={value >= MAX_GOALS} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  )
}

/**
 * The game's score, entered here and only here: the tracker stays about the stats. Anyone on the team can set it.
 * It links the game's stats to its result on the Season page.
 */
export function ScoreCard({ game, teamName, onSaved }: { game: Game; teamName: string; onSaved: (g: Game) => void }) {
  const repo = useRepo()
  const score = cleanScore(game.score)
  const [draft, setDraft] = useState<GameScore | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const result = resultOf(game)
  const us = teamName.trim() || 'Us', them = game.opponent.trim()

  const save = async (next: GameScore | null) => {
    setBusy(true); setError('')
    const { id, teamId: _t, createdAt: _c, updatedAt: _u, ...rest } = game
    try { onSaved(await repo.saveGame({ ...rest, id, score: next })); setDraft(null) } catch { setError('Could not save the score. Try again.') }
    setBusy(false)
  }

  if (draft) return (
    <section className="card score editing" aria-labelledby="score-h">
      <h2 id="score-h">{game.status === 'final' ? 'Final score' : 'Score'}</h2>
      <div className="steps">
        <Stepper id="score-us" label={us} value={draft.us} onChange={(v) => setDraft({ ...draft, us: v })} />
        <Stepper id="score-them" label={them} value={draft.them} onChange={(v) => setDraft({ ...draft, them: v })} />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => save(draft)}>Save score</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setDraft(null); setError('') }}>Cancel</button>
        {score && <button type="button" className="btn" disabled={busy} onClick={() => save(null)}>Remove score</button>}
      </div>
    </section>
  )

  if (!score) return game.status === 'final' ? (
    <section className="card score ask" aria-labelledby="score-h">
      <h2 id="score-h">What was the final score?</h2>
      <p className="sub">Add it to see how this game's stats line up with the result on the Season page.</p>
      <div className="actions"><button type="button" className="btn primary" onClick={() => setDraft({ us: 0, them: 0 })}>Add score</button></div>
    </section>
  ) : (
    <div className="actions"><button type="button" className="btn" onClick={() => setDraft({ us: 0, them: 0 })}>Add score</button></div>
  )

  return (
    <section className="card score" aria-labelledby="score-h">
      <div className="title-row">
        <h2 id="score-h">{game.status === 'final' ? 'Final score' : 'Score so far'}</h2>
        <button type="button" className="btn" onClick={() => setDraft(score)} aria-label="Edit score">Edit</button>
      </div>
      <p className="board" aria-label={`${us} ${score.us}, ${them} ${score.them}`}>
        <span><b>{score.us}</b><small>{us}</small></span>
        <span className="dash" aria-hidden="true">–</span>
        <span><b>{score.them}</b><small>{them}</small></span>
      </p>
      {result && game.status === 'final' && <p className={`result r-${result}`}>{RESULT_WORD[result]}</p>}
    </section>
  )
}
