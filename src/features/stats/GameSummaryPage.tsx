import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepo } from '../../data/context'
import { useRemembered } from '../../data/remember'
import type { Game, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { categoryLabel, eventsToCsv, fmtPct, gameSummaryToText, outcomeLabel } from '../../lib/export'
import { CLS, download, periodBreakdown, POSITIVE, slug, takeaways } from './insights'
import { canThank } from '../../lib/thanks'
import { canStartTracking } from '../../lib/schedule'
import { ThanksHeart } from '../thanks/ThanksHeart'
import { InfoButton } from '../guide/InfoButton'
import { FieldMap } from './FieldMap'
import { ZoneBreakdown } from './ZoneBreakdown'
import { zonedEvents, zoneNotes } from './zoneStats'
import { StatHero } from './StatHero'
import { PeriodTable } from './PeriodTable'
import { ShareImage } from './ShareImage'
import { ScoreCard } from './ScoreCard'
import { COUNT_OF, opponentKey, pctOf } from './trends'
import { useTeam } from '../shell/useTeam'
import { cleanClock, clockText, lengthText, playedGameMs, playedMs } from '../../lib/clock'
import './stats.css'

const LETTER = { duel: 'D', first_contact: 'F', box_entry: 'B' } as const
const cell = (n: number, d: number) => (d === 0 ? '—' : <>{n}/{d} <small>{fmtPct((n / d) * 100)}</small></>)
const CATS = ['duel', 'first_contact', 'box_entry'] as const
const shortDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** "Played 25:40 + 26:02 = 51:42 (set for 2 × 25 = 50 min)": the clock from the tracker, and the half lengths from the form. */
function timeText(g: Game) {
  const halves = cleanClock(g.clock)?.map((_, i) => playedMs(g, i + 1)).filter((ms) => ms > 0) ?? []
  const planned = lengthText(g)
  if (!halves.length) return planned ? `Set for ${planned}` : ''
  const played = halves.length > 1 ? `${halves.map(clockText).join(' + ')} = ${clockText(playedGameMs(g))}` : clockText(halves[0])
  return `Played ${played}${planned ? ` (set for ${planned})` : ''}`
}

/** Earlier games against the same opponent that have stats, most recent first. */
function meetings(game: Game, games: Game[], all: StatEvent[]) {
  const key = opponentKey(game.opponent)
  return games
    .filter((g) => g.id !== game.id && opponentKey(g.opponent) === key && (g.date < game.date || (g.date === game.date && g.createdAt < game.createdAt)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map((g) => ({ game: g, s: summarize(all.filter((e) => e.gameId === g.id)) }))
    .filter((r) => CATS.some((c) => COUNT_OF[c](r.s).d > 0))
}

export default function GameSummaryPage() {
  const { id = '' } = useParams()
  const repo = useRepo()
  const [game, setGame] = useRemembered<Game | null | undefined>(repo, `game:${id}`, undefined)
  const [events, setEvents] = useRemembered<StatEvent[]>(repo, `events:${id}`, [])
  const [status, setStatus] = useState('')
  const { team } = useTeam()
  const goals = team?.goals ?? {}
  const [season, setSeason] = useState<{ games: Game[]; events: StatEvent[] } | null>(null)

  const load = useCallback(async () => {
    const [g, ev] = await Promise.all([repo.getGame(id), repo.listEvents(id)])
    setGame(g); setEvents(ev)
    // Earlier games against this opponent: nice to have, so a failure here never hides the summary.
    Promise.all([repo.listGames(), repo.listAllEvents()]).then(([games, events]) => setSeason({ games, events }), () => {})
  }, [repo, id, setGame, setEvents])
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
  const where = zoneNotes(events)
  const text = gameSummaryToText(game, s, [...notes, ...where])
  const fc = s.firstContact
  const before = season ? meetings(game, season.games, season.events) : []

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
        {canThank(game.status) && <ThanksHeart gameId={game.id} />}
      </header>

      <ScoreCard game={game} teamName={team?.name ?? ''} onSaved={setGame} />

      <div className="actions">
        {canStartTracking(game) && <Link className="btn primary" to={`/games/${game.id}/track`}>{game.status === 'live' ? 'Continue tracking' : 'Start tracking'}</Link>}
        <Link className="btn" to={`/games/${game.id}/edit`}>Edit</Link>
        <ShareImage input={{ game, events, team, goals }} onStatus={setStatus} />
        <button className="btn" onClick={share}>Share summary</button>
        <button className="btn" onClick={() => download(`${slug(game.opponent)}-${game.date}-events.csv`, eventsToCsv(events, [game]))}>Export CSV</button>
      </div>
      {game.status === 'scheduled' && !canStartTracking(game) && <p className="sub">Tracking opens on game day.</p>}
      <div className="status" role="status" aria-live="polite">{status}</div>

      <section className="hero" aria-label="Key stats">
        <StatHero cls="d" label="Defensive 1v1s won" pct={s.duels.winPct} n={s.duels.won} d={s.duels.total} unit="1v1s" info={<InfoButton topic="duel" />} goal={goals.duel} />
        <StatHero cls="f" label="Clean first contact" pct={fc.cleanPct} n={fc.clean} d={fc.total} unit="balls" info={<InfoButton topic="first_contact" />} goal={goals.first_contact} />
        <StatHero cls="b" label="Box entries with a shot" pct={s.boxEntries.shotPct} n={s.boxEntries.shot} d={s.boxEntries.total} unit="entries" info={<InfoButton topic="box_entry" />} goal={goals.box_entry} />
      </section>

      <section className="card" aria-labelledby="take">
        <h2 id="take">Coach's takeaways</h2>
        <ul className="take">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>

      {live.length > 0 && (
        <section className="card" aria-labelledby="map">
          <h2 id="map">Game map</h2>
          <FieldMap events={events} periods={periodBreakdown(live, game.periods)} />
        </section>
      )}

      {CATS.some((c) => zonedEvents(events, c).length > 0) && (
        <section className="card" aria-labelledby="zones">
          <h2 id="zones">Where it happened</h2>
          <ZoneBreakdown events={events} />
        </section>
      )}

      <section className="card" aria-labelledby="per">
        <h2 id="per">By half</h2>
        {timeText(game) && <p className="sub">{timeText(game)}</p>}
        <PeriodTable events={live} periods={periodBreakdown(live, game.periods)} count={game.periods} goals={goals} />
      </section>

      {before.length > 0 && (
        <section className="card" aria-labelledby="h2h">
          <h2 id="h2h">Against {game.opponent.trim()} before</h2>
          <p className="sub">{before.length === 1 ? 'One earlier game' : `${before.length} earlier games`} against them, next to this one.</p>
          <div className="scroll"><table>
            <thead><tr><th scope="col">Game</th><th scope="col">1v1s won</th><th scope="col">Clean contact</th><th scope="col">Entries w/ shot</th></tr></thead>
            <tbody>
              <tr className="this">
                <th scope="row">This game</th>
                {CATS.map((c) => { const n = COUNT_OF[c](s), last = COUNT_OF[c](before[0].s), p = pctOf(n), lp = pctOf(last)
                  const diff = p !== null && lp !== null ? Math.round(p - lp) : null
                  return <td key={c}>{cell(n.n, n.d)}{diff !== null && diff !== 0 && <span className={`chg ${diff > 0 ? 'up' : 'down'}`} aria-label={`, ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} points on last time`}> {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}</span>}</td> })}
              </tr>
              {before.map((r) => (
                <tr key={r.game.id}>
                  <th scope="row"><Link to={`/games/${r.game.id}`}>{shortDate(r.game.date)}</Link></th>
                  {CATS.map((c) => { const n = COUNT_OF[c](r.s); return <td key={c}>{cell(n.n, n.d)}</td> })}
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="sub">▲▼ compare with the last time you played them.</p>
        </section>
      )}

      <section className="card f" aria-labelledby="fcs">
        <div className="title-row"><h2 id="fcs">First contact: through balls vs long balls</h2><InfoButton topic="first_contact" /></div>
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
