import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepo } from '../../data/context'
import type { Game, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { categoryLabel, eventsToCsv, fmtPct, gameSummaryToText, outcomeLabel } from '../../lib/export'
import { CLS, download, periodBreakdown, POSITIVE, slug, takeaways } from './insights'
import { FieldMap } from './FieldMap'
import { StatHero } from './StatHero'
import './stats.css'

const LETTER = { duel: 'D', first_contact: 'F', box_entry: 'B' } as const
const cell = (n: number, d: number) => (d === 0 ? '—' : <>{n}/{d} <small>{fmtPct((n / d) * 100)}</small></>)

export default function GameSummaryPage() {
  const { id = '' } = useParams()
  const repo = useRepo()
  const [game, setGame] = useState<Game | null | undefined>(undefined)
  const [events, setEvents] = useState<StatEvent[]>([])
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    const [g, ev] = await Promise.all([repo.getGame(id), repo.listEvents(id)])
    setGame(g); setEvents(ev)
  }, [repo, id])
  useEffect(() => {
    load().catch(() => setGame(null))
    return repo.subscribe(() => { load().catch(() => {}) })
  }, [repo, load])

  if (game === undefined) return <main className="stats"><p className="empty" role="status">Loading…</p></main>
  if (game === null) return (
    <main className="stats"><Link className="back" to="/">← Games</Link>
      <div className="card empty">Game not found.</div></main>
  )

  const s = summarize(events)
  const notes = takeaways(s)
  const live = events.filter((e) => !e.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const text = gameSummaryToText(game, s, notes)
  const fc = s.firstContact

  const share = async () => {
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ title: `vs ${game.opponent}`, text }); return }
      await navigator.clipboard.writeText(text)
      setStatus('Summary copied to clipboard.')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setStatus('Could not share. Try exporting the CSV instead.')
    }
  }

  const dateLabel = new Date(game.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <main className="stats">
      <Link className="back" to="/">← Games</Link>
      <header>
        <h1>{game.home ? 'vs' : '@'} {game.opponent}</h1>
        <p className="sub">{dateLabel}{game.location ? ` · ${game.location}` : ''} · {game.status === 'final' ? 'Final' : game.status === 'live' ? 'In progress' : 'Scheduled'}</p>
      </header>

      <div className="actions">
        {game.status !== 'final' && <Link className="btn primary" to={`/games/${game.id}/track`}>Continue tracking</Link>}
        <Link className="btn" to={`/games/${game.id}/edit`}>Edit</Link>
        <button className="btn" onClick={share}>Share summary</button>
        <button className="btn" onClick={() => download(`${slug(game.opponent)}-${game.date}-events.csv`, eventsToCsv(events, [game]))}>Export CSV</button>
      </div>
      <div className="status" role="status" aria-live="polite">{status}</div>

      <section className="hero" aria-label="Key stats">
        <StatHero cls="d" label="Defensive 1v1s won" pct={s.duels.winPct} n={s.duels.won} d={s.duels.total} unit="1v1s" />
        <StatHero cls="f" label="Clean first contact" pct={fc.cleanPct} n={fc.clean} d={fc.total} unit="balls" />
        <StatHero cls="b" label="Box entries with a shot" pct={s.boxEntries.shotPct} n={s.boxEntries.shot} d={s.boxEntries.total} unit="entries" />
      </section>

      <section className="card" aria-labelledby="take">
        <h2 id="take">Coach's takeaways</h2>
        <ul className="take">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>

      {live.length > 0 && (
        <section className="card" aria-labelledby="map">
          <h2 id="map">Game map</h2>
          <FieldMap events={events} />
        </section>
      )}

      <section className="card" aria-labelledby="per">
        <h2 id="per">By half</h2>
        <div className="scroll"><table>
          <thead><tr><th scope="col">Half</th><th scope="col">1v1s won</th><th scope="col">Clean contact</th><th scope="col">Entries w/ shot</th></tr></thead>
          <tbody>
            {periodBreakdown(live, game.periods).map((p) => {
              const ps = summarize(live.filter((e) => e.period === p))
              return <tr key={p}><th scope="row">{p}</th><td>{cell(ps.duels.won, ps.duels.total)}</td><td>{cell(ps.firstContact.clean, ps.firstContact.total)}</td><td>{cell(ps.boxEntries.shot, ps.boxEntries.total)}</td></tr>
            })}
          </tbody>
        </table></div>
      </section>

      <section className="card f" aria-labelledby="fcs">
        <h2 id="fcs">First contact: through balls vs long balls</h2>
        <div className="split">
          <div><span className="sub">Through balls</span><b>{cell(fc.throughBall.clean, fc.throughBall.clean + fc.throughBall.miss)}</b><span className="sub">clean</span></div>
          <div><span className="sub">Long balls</span><b>{cell(fc.longBall.clean, fc.longBall.clean + fc.longBall.miss)}</b><span className="sub">clean</span></div>
        </div>
      </section>

      <section className="card" aria-labelledby="tl">
        <h2 id="tl">Timeline</h2>
        {live.length === 0 ? <p className="sub">No events yet.</p> : (
          <>
            <div className="timeline" role="list" aria-label={`${live.length} events in order`}>
              {live.map((e) => (
                <span key={e.id} role="listitem" className={`tick ${CLS[e.category]} ${POSITIVE.has(e.outcome) ? 'pos' : ''}`}
                  title={`${categoryLabel(e.category)}: ${outcomeLabel(e.outcome)} (period ${e.period})`}
                  aria-label={`${categoryLabel(e.category)}: ${outcomeLabel(e.outcome)}, period ${e.period}`}>{LETTER[e.category]}</span>
              ))}
            </div>
            <div className="legend" aria-hidden="true">
              <span>D = 1v1</span><span>F = first contact</span><span>B = box entry</span><span>Filled = good outcome, outline = not</span>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
