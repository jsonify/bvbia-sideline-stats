import { useEffect, useRef, useState } from 'react'
import type { Game } from '../../types'
import { cleanMinutes, clockText, gameMs, halfMs, halfStarted, runningHalf } from '../../lib/clock'
import { haptic } from './useTracker'

const halfName = (n: number) => (n === 1 ? '1st half' : '2nd half')

/**
 * The game clock, in the tracker's header: the half on screen counting up to its length (then into added time), and the
 * whole game, which is every half added up. Any phone that is tracking can start and pause it; a phone that is only
 * watching just sees it. It lives on the game, so every phone shows the same time.
 */
export function ClockBar({ game, period, canEdit, onChange }: {
  game: Game; period: number; canEdit: boolean; onChange: (action: 'start' | 'pause' | 'reset', half: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [confirmReset, setConfirmReset] = useState(false)
  const running = runningHalf(game.clock)
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [running, game.clock])

  const minutes = cleanMinutes(game.halfMinutes, game.periods)
  const lengthMs = minutes ? minutes[period - 1] * 60_000 : null
  const fullMs = minutes ? minutes.reduce((a, b) => a + b, 0) * 60_000 : null
  const played = halfMs(game.clock, period, now)
  const total = gameMs(game.clock, now)
  const over = lengthMs !== null && played >= lengthMs
  const isRunning = running === period
  const started = halfStarted(game.clock, period)
  const locked = game.status === 'final'

  // Buzz once, on the phone running the clock, when the half reaches its length.
  const buzzed = useRef(new Set<number>())
  useEffect(() => {
    if (!over || !isRunning || !canEdit || buzzed.current.has(period)) return
    buzzed.current.add(period)
    haptic([200, 100, 200])
  }, [over, isRunning, canEdit, period])

  const halfLabel = lengthMs === null ? clockText(played) : over ? `${clockText(lengthMs)} +${clockText(played - lengthMs)}` : clockText(played)
  const aria = `${halfName(period)} clock: ${clockText(played)}${lengthMs !== null ? ` of ${clockText(lengthMs)}` : ''}${isRunning ? ', running' : started ? ', paused' : ', not started'}. Game: ${clockText(total)}${fullMs !== null ? ` of ${clockText(fullMs)}` : ''}`

  const startLabel = started ? 'Resume' : period === 1 ? 'Kick off' : `Start ${halfName(period)}`

  return (
    <div className={`tk-clock${isRunning ? ' running' : ''}${over ? ' over' : ''}`}>
      <div className="tk-clock-time" role="timer" aria-label={aria}>
        <b>{halfLabel}</b>
        <small>
          {lengthMs !== null && !over && `of ${clockText(lengthMs)} · `}
          Game {clockText(total)}{fullMs !== null && ` / ${clockText(fullMs)}`}
        </small>
      </div>
      {canEdit && !locked && (
        <div className="tk-clock-btns">
          {started && !isRunning && <button type="button" className="tk-clock-reset" onClick={() => setConfirmReset(true)}>Reset</button>}
          {isRunning
            ? <button type="button" onClick={() => onChange('pause', period)} aria-label={`Pause the ${halfName(period)} clock`}>❚❚ Pause</button>
            : <button type="button" className="primary" onClick={() => onChange('start', period)}>▶ {startLabel}</button>}
        </div>
      )}

      {confirmReset && (
        <div className="tk-scrim" onClick={() => setConfirmReset(false)}>
          <div className="tk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="reset-h">Reset the {halfName(period)} clock?</h2>
            <p>It goes back to 0:00 ({clockText(played)} played so far). Use this if it was started by mistake or too early.</p>
            <div>
              <button type="button" autoFocus onClick={() => setConfirmReset(false)}>Keep it</button>
              <button type="button" className="danger" onClick={() => { setConfirmReset(false); onChange('reset', period) }}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
