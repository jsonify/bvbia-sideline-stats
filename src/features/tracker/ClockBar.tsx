import { useEffect, useRef, useState } from 'react'
import type { Game } from '../../types'
import { cleanMinutes, clockText, halfStarted, lengthMs, playedGameMs, playedMs, runningHalf } from '../../lib/clock'
import { haptic } from './useTracker'
import { Sheet } from '../../ui'

const halfName = (n: number) => (n === 1 ? '1st half' : '2nd half')

/**
 * The game clock, beside the score in the tracker's header: the half on screen counting up to its length, and the whole
 * game, which is every half added up. It is a running clock: once a half kicks off it runs until its length (halftime,
 * then full time) and stops there by itself, so there is nothing to pause. Any phone that is tracking can kick a half off;
 * a phone that is only watching just sees it. It lives on the game, so every phone shows the same time. Tapping the time
 * opens a sheet with the time played counting up beside the time left counting down, for the half and the whole game.
 */
export function ClockBar({ game, period, canEdit, onChange }: {
  game: Game; period: number; canEdit: boolean; onChange: (action: 'start' | 'reset', half: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [confirmReset, setConfirmReset] = useState(false)
  const [open, setOpen] = useState(false)
  const running = runningHalf(game.clock)
  const len = lengthMs(game, period)
  const played = playedMs(game, period, now)
  const done = len !== null && played >= len // reached halftime / full time
  const ticking = running === period && !done
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [running, game.clock])

  const minutes = cleanMinutes(game.halfMinutes, game.periods)
  const fullMs = minutes ? minutes.reduce((a, b) => a + b, 0) * 60_000 : null
  const total = playedGameMs(game, now)
  const started = halfStarted(game.clock, period)
  const locked = game.status === 'final'
  const last = period === game.periods

  // Buzz once, on a phone that is tracking, when the clock stops at halftime or full time.
  const buzzed = useRef(new Set<number>())
  useEffect(() => {
    if (!done || running !== period || !canEdit || buzzed.current.has(period)) return
    buzzed.current.add(period)
    haptic([200, 100, 200])
  }, [done, running, canEdit, period])

  const state = ticking ? 'running' : done ? (last ? 'full time' : 'halftime') : started ? 'stopped' : 'not started'
  const aria = `${halfName(period)} clock: ${clockText(played)}${len !== null ? ` of ${clockText(len)}` : ''}, ${state}. Game: ${clockText(total)}${fullMs !== null ? ` of ${clockText(fullMs)}` : ''}`
  const note = done ? (last ? 'Full time' : 'Halftime') : len === null ? `${halfName(period)} clock` : `of ${clockText(len)}`

  return (
    <div className={`tk-clock${ticking ? ' running' : ''}${done ? ' done' : ''}`}>
      <button type="button" className="tk-clock-time" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span role="timer" aria-label={`${aria}. Show time left`}>
          <b>{clockText(played)}</b>
          <small>{note}</small>
          <small>Game {clockText(total)}{fullMs !== null && ` / ${clockText(fullMs)}`}</small>
        </span>
      </button>
      {canEdit && !locked && (
        <div className="tk-clock-btns">
          {!started && (
            <button type="button" className="tk-clock-go primary" onClick={() => onChange('start', period)}
              aria-label={period === 1 ? 'Kick off' : `Start ${halfName(period)}`}>▶</button>
          )}
          {started && <button type="button" className="tk-clock-reset" onClick={() => setConfirmReset(true)}>Reset</button>}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Game clock" className="clock-sheet">
        <div className="tk-cs">
          <p className="tk-cs-state">{halfName(period)} · {ticking ? 'Running' : done ? (last ? 'Full time' : 'Halftime') : started ? 'Stopped' : 'Not started'}</p>
          <div className="tk-cs-row" role="group" aria-label={halfName(period)}>
            <div><small>Played</small><b role="timer">{clockText(played)}</b></div>
            <div className="left"><small>Time left</small><b role="timer">{len !== null ? clockText(len - played) : '—'}</b></div>
          </div>
          <div className="tk-cs-row game" role="group" aria-label="Whole game">
            <div><small>Game played</small><b role="timer">{clockText(total)}</b></div>
            <div className="left"><small>Game left</small><b role="timer">{fullMs !== null ? clockText(fullMs - total) : '—'}</b></div>
          </div>
          {len === null && <p className="tk-cs-note">Set a half length on the game (Edit) to see the time left.</p>}
        </div>
      </Sheet>

      {confirmReset && (
        <div className="tk-scrim" onClick={() => setConfirmReset(false)}>
          <div className="tk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="reset-h">Reset the {halfName(period)} clock?</h2>
            <p>It goes back to 0:00 and stops ({clockText(played)} played so far). Use this if it was started by mistake or too early, then kick it off again.</p>
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
