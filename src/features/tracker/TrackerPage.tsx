import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { summarize } from '../../lib/summary'
import { StatCard } from './StatCard'
import { eventLabel, isGood, tallyText } from './labels'
import { useTracker, useWakeLock } from './useTracker'
import './tracker.css'

const SYNC_TEXT = { synced: 'Synced', syncing: 'Syncing', offline: 'Offline', error: 'Sync error' } as const

export default function TrackerPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const t = useTracker(id)
  useWakeLock()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const { game, summary: s, periodSummary: p } = t

  if (!t.loaded) return <main className="tk"><p className="tk-empty">Loading game…</p></main>
  if (!game) return <main className="tk"><p className="tk-empty">Game not found. <Link to="/">Back to games</Link></p></main>

  const locked = game.status === 'final'
  const sync = t.sync
  const syncLabel = sync.state !== 'synced' && sync.pending > 0 ? `${SYNC_TEXT[sync.state]} · ${sync.pending} pending` : SYNC_TEXT[sync.state]
  const recent = [...t.events].reverse().slice(0, 6)
  const ft = s.firstContact
  const pf = p.firstContact

  const endGame = async () => {
    await t.setStatus('final')
    nav(`/games/${game.id}`)
  }

  return (
    <main className="tk">
      <header className="tk-top">
        <div className="tk-top-row">
          <Link to="/" className="tk-back" aria-label="Back to games">‹</Link>
          <div className="tk-title">
            <h1>vs {game.opponent}</h1>
            <span className={`tk-status ${game.status}`}>{game.status === 'live' ? '● Live' : game.status === 'final' ? 'Final' : 'Not started'}</span>
          </div>
          <span className={`tk-sync ${sync.state}`} role="status" aria-label={`Sync status: ${syncLabel}`}>
            <i aria-hidden="true" />{syncLabel}
          </span>
        </div>
        <div className="tk-periods" role="group" aria-label="Period">
          {Array.from({ length: game.periods }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-pressed={t.period === n} onClick={() => t.setPeriod(n)}>
              {game.periods === 2 ? (n === 1 ? '1st half' : '2nd half') : `Q${n}`}
            </button>
          ))}
        </div>
      </header>

      {game.status === 'scheduled' && (
        <button type="button" className="tk-start" onClick={() => t.setStatus('live')}>▶ Start game</button>
      )}
      {locked && <p className="tk-final">Game is final. <Link to={`/games/${game.id}`}>View summary</Link></p>}

      <StatCard id="duel" title="Defensive 1v1s" hint="Did we win the duel?"
        tally={tallyText(s.duels.won, s.duels.total, s.duels.winPct)}
        periodTally={`${p.duels.won}/${p.duels.total}`} period={t.period} pct={s.duels.winPct} disabled={locked}
        buttons={[
          { label: 'Won', icon: '✓', tone: 'good', aria: 'Duel won', onTap: () => t.recordDuel('won') },
          { label: 'Lost', icon: '✕', tone: 'bad', aria: 'Duel lost', onTap: () => t.recordDuel('lost') },
        ]} />

      <StatCard id="contact" title="First contact" hint="Through balls and long balls"
        tally={tallyText(ft.clean, ft.total, ft.cleanPct)}
        periodTally={`${pf.clean}/${pf.total}`} period={t.period} pct={ft.cleanPct} disabled={locked}
        extra={
          <div className="tk-seg" role="radiogroup" aria-label="Ball type">
            {([['through_ball', 'Through ball', ft.throughBall], ['long_ball', 'Long ball', ft.longBall]] as const).map(([v, label, b]) => (
              <button key={v} type="button" role="radio" aria-checked={t.ballType === v} onClick={() => t.setBallType(v)}>
                {label}<small>{b.clean}/{b.clean + b.miss}</small>
              </button>
            ))}
          </div>
        }
        buttons={[
          { label: 'Clean', icon: '✓', tone: 'good', aria: 'First contact clean', onTap: () => t.recordContact('clean') },
          { label: 'Miss', icon: '✕', tone: 'bad', aria: 'First contact miss', onTap: () => t.recordContact('miss') },
        ]} />

      <StatCard id="box" title="Box entries" hint="Got into the box: did we shoot?"
        tally={tallyText(s.boxEntries.shot, s.boxEntries.total, s.boxEntries.shotPct)}
        periodTally={`${p.boxEntries.shot}/${p.boxEntries.total}`} period={t.period} pct={s.boxEntries.shotPct} disabled={locked}
        buttons={[
          { label: 'Shot', icon: '◎', tone: 'good', aria: 'Box entry with shot', onTap: () => t.recordBox('shot') },
          { label: 'No shot', icon: '⊘', tone: 'bad', aria: 'Box entry, no shot', onTap: () => t.recordBox('no_shot') },
        ]} />

      <section className="tk-recent" aria-label="Recent taps">
        <h2>Recent taps</h2>
        {recent.length === 0 ? <p className="tk-empty">Nothing yet. Tap a button above.</p> : (
          <ul>
            {recent.map((e) => (
              <li key={e.id} className={isGood(e) ? 'good' : 'bad'}>
                <span className="tk-ico" aria-hidden="true">{isGood(e) ? '✓' : '✕'}</span>
                <span className="lbl">{eventLabel(e)}</span>
                <span className="per">P{e.period}</span>
                <button type="button" aria-label={`Undo ${eventLabel(e)}`} onClick={() => t.undo(e)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
        {game.status === 'live' && (
          <button type="button" className="tk-end" onClick={() => setConfirmEnd(true)}>End game</button>
        )}
      </section>

      {t.toast && <div className="tk-toast" key={t.toast.key} role="status" aria-live="polite">{t.toast.msg}</div>}

      <div className="tk-undo">
        <button type="button" className="tk-undo-btn" disabled={!t.last || locked} onClick={() => t.undo()}
          aria-label={t.last ? `Undo last: ${eventLabel(t.last)}` : 'Undo last tap'}>
          <span aria-hidden="true">↶</span>
          <span className="txt"><b>Undo</b><small>{t.last ? eventLabel(t.last) : 'nothing to undo'}</small></span>
        </button>
      </div>

      {confirmEnd && (
        <div className="tk-scrim" onClick={() => setConfirmEnd(false)}>
          <div className="tk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="end-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="end-h">End game?</h2>
            <p>{summarize(t.events).duels.total + ft.total + s.boxEntries.total} taps recorded. You will see the summary next.</p>
            <div>
              <button type="button" autoFocus onClick={() => setConfirmEnd(false)}>Keep tracking</button>
              <button type="button" className="danger" onClick={endGame}>End game</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
