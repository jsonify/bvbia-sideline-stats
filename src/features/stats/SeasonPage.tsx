import { useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useRepo } from '../../data/context'
import { useRemembered } from '../../data/remember'
import type { Game, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { eventsToCsv, fmtPct, seasonToCsv } from '../../lib/export'
import { download } from './insights'
import { InfoButton } from '../guide/InfoButton'
import { StatHero } from './StatHero'
import { useTeam } from '../shell/useTeam'
import { byOpponent, COUNT_OF, deltaText, pctOf, recentForm, rollingPct, RECENT } from './trends'
import './stats.css'

type Row = { game: Game; s: ReturnType<typeof summarize> }
const STATS = [
  { key: 'duel', cat: 'duel', cls: 'd', color: 'var(--s-duel)', title: 'Defensive 1v1s won', unit: '1v1s',
    get: (r: Row) => ({ pct: r.s.duels.winPct, n: r.s.duels.won, d: r.s.duels.total }) },
  { key: 'fc', cat: 'first_contact', cls: 'f', color: 'var(--s-fc)', title: 'Clean first contact', unit: 'balls',
    get: (r: Row) => ({ pct: r.s.firstContact.cleanPct, n: r.s.firstContact.clean, d: r.s.firstContact.total }) },
  { key: 'box', cat: 'box_entry', cls: 'b', color: 'var(--s-box)', title: 'Box entries with a shot', unit: 'entries',
    get: (r: Row) => ({ pct: r.s.boxEntries.shotPct, n: r.s.boxEntries.shot, d: r.s.boxEntries.total }) },
] as const

const MIN = 3 // minimum events for best/worst callouts
const shortDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function SeasonPage() {
  const repo = useRepo()
  const goals = useTeam().team?.goals ?? {}
  const [games, setGames] = useRemembered<Game[] | null>(repo, 'games', null)
  const [events, setEvents] = useRemembered<StatEvent[]>(repo, 'all-events', [])

  const load = useCallback(async () => {
    const [g, e] = await Promise.all([repo.listGames(), repo.listAllEvents()])
    setGames(g); setEvents(e)
  }, [repo, setGames, setEvents])
  useEffect(() => {
    load().catch(() => setGames([]))
    return repo.subscribe(() => { load().catch(() => {}) })
  }, [repo, load])

  const rows: Row[] = useMemo(() => (games ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
    .map((game) => ({ game, s: summarize(events.filter((e) => e.gameId === game.id)) })), [games, events])
  const total = useMemo(() => summarize(events), [events])

  if (games === null) return <main className="stats"><p className="empty" role="status">Loading…</p></main>

  const played = rows.filter((r) => r.s.duels.total + r.s.firstContact.total + r.s.boxEntries.total > 0)
  const stamp = new Date().toISOString().slice(0, 10)
  const opponents = byOpponent(played)

  return (
    <main className="stats">
      <header>
        <h1>Season</h1>
        <p className="sub">{games.length} {games.length === 1 ? 'game' : 'games'} · {events.length} events tracked</p>
      </header>

      {played.length === 0 ? (
        <div className="card empty">
          <p><b>No stats yet</b></p>
          <p>Track a game and your season trends will show up here.</p>
          <Link className="btn primary" to="/games/new">Start a game</Link>
        </div>
      ) : (
        <>
          <section className="hero" aria-label="Season totals">
            <StatHero cls="d" label="Defensive 1v1s won" pct={total.duels.winPct} n={total.duels.won} d={total.duels.total} unit="1v1s" info={<InfoButton topic="duel" />} goal={goals.duel} />
            <StatHero cls="f" label="Clean first contact" pct={total.firstContact.cleanPct} n={total.firstContact.clean} d={total.firstContact.total} unit="balls" info={<InfoButton topic="first_contact" />} goal={goals.first_contact} />
            <StatHero cls="b" label="Box entries with a shot" pct={total.boxEntries.shotPct} n={total.boxEntries.shot} d={total.boxEntries.total} unit="entries" info={<InfoButton topic="box_entry" />} goal={goals.box_entry} />
          </section>

          {STATS.map((st) => {
            const counts = played.map((r) => COUNT_OF[st.cat](r.s))
            const avg = rollingPct(counts)
            const data = played.map((r, i) => ({ label: shortDate(r.game.date), opp: r.game.opponent, ...st.get(r), avg: avg[i] }))
            const withData = data.filter((x) => x.pct !== null)
            const goal = goals[st.cat]
            const form = recentForm(counts)
            const desc = withData.length
              ? `Line chart of ${st.title} by game${goal !== undefined ? `, target ${goal}%` : ''}. ` + withData.map((x) => `${x.label} vs ${x.opp}: ${fmtPct(x.pct)}`).join('; ') + '.'
              : `No ${st.title} data yet.`
            return (
              <section key={st.key} className={`card ${st.cls}`} aria-labelledby={`c-${st.key}`}>
                <h2 id={`c-${st.key}`}>{st.title} by game</h2>
                {form && (
                  <p className={`form ${form.delta > 0 ? 'up' : form.delta < 0 ? 'down' : ''}`}>
                    <b>Last {form.games} games: {fmtPct(form.recentPct)}</b>, {deltaText(form.delta)} on the games before ({fmtPct(form.beforePct)}).
                  </p>
                )}
                {withData.length === 0 ? <p className="sub">No data yet.</p> : (
                  <div className="chart" role="img" aria-label={desc}>
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 180 }}>
                      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} unit="%" tickLine={false} axisLine={false} fontSize={11} />
                        <Tooltip formatter={(v, name) => [fmtPct(v as number), name]}
                          labelFormatter={(_, p) => (p?.[0]?.payload ? `vs ${p[0].payload.opp}` : '')}
                          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
                        {goal !== undefined && <ReferenceLine y={goal} stroke="var(--text)" strokeOpacity={0.55} strokeDasharray="2 4" ifOverflow="extendDomain" />}
                        {withData.length >= RECENT && (
                          <Line type="monotone" dataKey="avg" name={`${RECENT}-game average`} stroke={st.color} strokeOpacity={0.5} strokeWidth={2}
                            strokeDasharray="6 4" connectNulls dot={false} activeDot={false} isAnimationActive={false} />
                        )}
                        <Line type="monotone" dataKey="pct" name={st.title} stroke={st.color} strokeWidth={2} connectNulls
                          dot={{ r: 4, fill: st.color, stroke: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {withData.length > 0 && (withData.length >= RECENT || goal !== undefined) && (
                  <div className="chart-key" aria-hidden="true">
                    <span><i className="k-game" />Each game</span>
                    {withData.length >= RECENT && <span><i className="k-avg" />{RECENT}-game average</span>}
                    {goal !== undefined && <span><i className="k-goal" />Target {goal}%</span>}
                  </div>
                )}
              </section>
            )
          })}

          <section className="card" aria-labelledby="hl">
            <h2 id="hl">Best and toughest games</h2>
            <div className="callouts">
              {STATS.map((st) => {
                const c = played.map((r) => ({ r, ...st.get(r) })).filter((x) => x.d >= MIN && x.pct !== null)
                if (c.length < 2) return <div key={st.key}><b>{st.title}:</b> not enough games with {MIN}+ events yet.</div>
                const best = c.reduce((a, b) => ((b.pct as number) > (a.pct as number) ? b : a))
                const worst = c.reduce((a, b) => ((b.pct as number) < (a.pct as number) ? b : a))
                return (
                  <div key={st.key}><b>{st.title}:</b> best vs {best.r.game.opponent} ({fmtPct(best.pct)}, {best.n} of {best.d}); toughest vs {worst.r.game.opponent} ({fmtPct(worst.pct)}, {worst.n} of {worst.d}).</div>
                )
              })}
            </div>
          </section>

          {opponents.some((o) => o.games.length > 1) && (
            <section className="card" aria-labelledby="opp">
              <h2 id="opp">By opponent</h2>
              <p className="sub">Every game against the same team, added together.</p>
              <div className="scroll"><table>
                <thead><tr><th scope="col">Opponent</th><th scope="col">Games</th><th scope="col">1v1s</th><th scope="col">Contact</th><th scope="col">Box</th></tr></thead>
                <tbody>
                  {opponents.map((o) => (
                    <tr key={o.name}>
                      <th scope="row">{o.name}</th>
                      <td>{o.games.length}</td>
                      {STATS.map((st) => { const c = o.counts[st.cat]; return <td key={st.key}>{fmtPct(pctOf(c))} <small>{c.d ? `${c.n}/${c.d}` : ''}</small></td> })}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>
          )}

          <section className="card" aria-labelledby="gt">
            <h2 id="gt">All games</h2>
            <div className="scroll"><table>
              <thead><tr><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">1v1s</th><th scope="col">Contact</th><th scope="col">Box</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.game.id}>
                    <td>{shortDate(r.game.date)}</td>
                    <td><Link to={`/games/${r.game.id}`}>{r.game.opponent}</Link></td>
                    {STATS.map((st) => { const v = st.get(r); return <td key={st.key}>{fmtPct(v.pct)} <small>{v.d ? `${v.n}/${v.d}` : ''}</small></td> })}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        </>
      )}

      <div className="actions">
        <button className="btn" disabled={events.length === 0} onClick={() => download(`season-events-${stamp}.csv`, eventsToCsv(events, games))}>Export all events (CSV)</button>
        <button className="btn" disabled={games.length === 0} onClick={() => download(`season-games-${stamp}.csv`, seasonToCsv(games, events))}>Export game summaries (CSV)</button>
      </div>
    </main>
  )
}
