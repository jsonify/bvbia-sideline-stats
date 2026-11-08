import { useEffect, useRef, useState } from 'react'
import type { Game } from '../../types'
import { cleanMinutes, clockText, extraGameMs, extraMs, halfStarted, lengthMs, playedGameMs, playedMs, runningHalf } from '../../lib/clock'
import { haptic } from './useTracker'
import { Sheet } from '../../ui'

const halfName = (n: number) => (n === 1 ? '1st half' : '2nd half')

/**
 * The game clock, beside the score in the tracker's header: the half on screen counting up to its length, and the whole
 * game, which is every half added up. It is a running clock: once a half kicks off it runs to its length, with no pause.
 * When the half's time runs out it keeps going as extra time ("+1:23"), counting up until a tracker taps Stop (■), which
 * ends the half (halftime, then full time). Kicking off the next half or ending the game also stops it. Any phone that is tracking can kick a half off;
 * a phone that is only watching just sees it. It lives on the game, so every phone shows the same time. Tapping the time
 * opens a sheet with the time played counting up beside the time left counting down, for the half and the whole game.
 */
export function ClockBar({ game, period, canEdit, onChange }: {
  game: Game; period: number; canEdit: boolean; onChange: (action: 'start' | 'stop' | 'reset', half: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [confirmReset, setConfirmReset] = useState(false)
  const [open, setOpen] = useState(false)
  const running = runningHalf(game.clock)
  const len = lengthMs(game, period)
  const played = playedMs(game, period, now)
  const done = len !== null && played >= len // the half's time has run out
  const extra = extraMs(game, period, now)
  const inExtra = done && running === period // time is up and extra time is counting until someone stops it
  const over = done && running !== period // stopped after its time ran out: halftime / full time
  const ticking = running === period
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [running, game.clock])

  const minutes = cleanMinutes(game.halfMinutes, game.periods)
  const fullMs = minutes ? minutes.reduce((a, b) => a + b, 0) * 60_000 : null
  const total = playedGameMs(game, now)
  const totalExtra = extraGameMs(game, now)
  const started = halfStarted(game.clock, period)
  const locked = game.status === 'final'
  const last = period === game.periods

  // Buzz once, on a phone that is tracking, when the half's time runs out and extra time starts.
  const buzzed = useRef(new Set<number>())
  useEffect(() => {
    if (!done || running !== period || !canEdit || buzzed.current.has(period)) return
    buzzed.current.add(period)
    haptic([200, 100, 200])
  }, [done, running, canEdit, period])

  const plus = (ms: number) => (ms > 0 ? ` +${clockText(ms)}` : '')
  const end = last ? 'Full time' : 'Halftime'
  const stateText = inExtra ? 'Extra time' : ticking ? 'Running' : over ? end : started ? 'Stopped' : 'Not started'
  const aria = `${halfName(period)} clock: ${clockText(played)}${len !== null ? ` of ${clockText(len)}` : ''}${extra > 0 ? `, plus ${clockText(extra)} extra time` : ''}, ${stateText.toLowerCase()}. Game: ${clockText(total)}${fullMs !== null ? ` of ${clockText(fullMs)}` : ''}${totalExtra > 0 ? `, plus ${clockText(totalExtra)} extra time` : ''}`
  const note = inExtra ? 'Extra time' : over ? end : len === null ? `${halfName(period)} clock` : `of ${clockText(len)}`

  return (
    <div className={`tk-clock${ticking ? ' running' : ''}${done ? ' done' : ''}${inExtra ? ' extra' : ''}`}>
      <button type="button" className="tk-clock-time" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span role="timer" aria-label={`${aria}. Show time left`}>
          <b>{clockText(played)}{extra > 0 && <em>{plus(extra)}</em>}</b>
          <small>{note}</small>
          <small>Game {clockText(total)}{fullMs !== null && ` / ${clockText(fullMs)}`}{plus(totalExtra)}</small>
        </span>
      </button>
      {canEdit && !locked && (
        <div className="tk-clock-btns">
          {!started && (
            <button type="button" className="tk-clock-go primary" onClick={() => onChange('start', period)}
              aria-label={period === 1 ? 'Kick off' : `Start ${halfName(period)}`}>▶</button>
          )}
          {inExtra && (
            <button type="button" className="tk-clock-go stop" onClick={() => onChange('stop', period)}
              aria-label={`Stop ${halfName(period)} (${last ? 'full time' : 'halftime'})`}>■</button>
          )}
          {started && <button type="button" className="tk-clock-reset" onClick={() => setConfirmReset(true)}>Reset</button>}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Game clock" className="clock-sheet">
        <div className="tk-cs">
          <p className="tk-cs-state">{halfName(period)} · {stateText}</p>
          <div className="tk-cs-row" role="group" aria-label={halfName(period)}>
            <div><small>Played</small><b role="timer">{clockText(played)}</b></div>
            <div className="left"><small>Time left</small><b role="timer">{len !== null ? clockText(len - played) : '—'}</b></div>
          </div>
          {extra > 0 && (
            <div className="tk-cs-row extra" role="group" aria-label="Extra time">
              <div><small>Extra time</small><b role="timer">+{clockText(extra)}</b></div>
              <div className="left"><small>{inExtra ? 'Tap ■ to stop' : end}</small></div>
            </div>
          )}
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
            <p>It goes back to 0:00 and stops ({clockText(played)}{plus(extra)} played so far). Use this if it was started by mistake or too early, then kick it off again.</p>
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
