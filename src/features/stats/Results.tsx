import type { Game, StatSummary, TeamGoals } from '../../types'
import { fmtPct } from '../../lib/export'
import { pctOf } from './trends'
import { recordText, resultGroups, resultNotes, seasonRecord, targetRecords } from './results'

const PLURAL = { W: 'Wins', D: 'Draws', L: 'Losses' } as const
const TARGET_LABEL = { duel: '1v1s', first_contact: 'Clean contact', box_entry: 'Box entries w/ shot' } as const
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/**
 * The season's record, and how the stats looked in wins, draws and losses: attack next to goals scored, defense next to
 * goals conceded. Scores come from each game's summary page, so this stays out of the tracker's way.
 */
export function Results({ games, played, goals }: { games: Game[]; played: { game: Game; s: StatSummary }[]; goals: TeamGoals }) {
  const record = seasonRecord(games)
  if (!record) return (
    <section className="card" aria-labelledby="res">
      <h2 id="res">Results</h2>
      <p className="sub">Add the final score on a game's summary page to see your record here, and how the stats line up with goals scored and conceded.</p>
    </section>
  )

  const groups = resultGroups(played)
  const notes = resultNotes(groups)
  const targets = targetRecords(played, goals)
  const diff = record.scored - record.conceded

  return (
    <section className="card results" aria-labelledby="res">
      <h2 id="res">Results</h2>
      <p className="record"><b>{recordText(record)}</b></p>
      <p className="sub">Scored {record.scored} · Conceded {record.conceded} ({diff > 0 ? '+' : ''}{diff}) · {record.games} {record.games === 1 ? 'game' : 'games'} with a score</p>

      {groups.length > 0 && (
        <>
          <h3>Attack and goals scored</h3>
          <div className="scroll"><table>
            <thead><tr><th scope="col">A game</th><th scope="col">Scored</th><th scope="col">Box entries</th><th scope="col">Shots</th><th scope="col">Entries w/ shot</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.result} className={`r-${g.result}`}>
                  <th scope="row">{PLURAL[g.result]} <small>({g.games})</small></th>
                  <td>{num(g.scored)}</td><td>{num(g.entries)}</td><td>{num(g.shots)}</td><td>{fmtPct(pctOf(g.counts.box_entry))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <h3>Defense and goals conceded</h3>
          <div className="scroll"><table>
            <thead><tr><th scope="col">A game</th><th scope="col">Conceded</th><th scope="col">1v1s won</th><th scope="col">Clean contact</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.result} className={`r-${g.result}`}>
                  <th scope="row">{PLURAL[g.result]} <small>({g.games})</small></th>
                  <td>{num(g.conceded)}</td><td>{fmtPct(pctOf(g.counts.duel))}</td><td>{fmtPct(pctOf(g.counts.first_contact))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          {notes.length > 0 && <ul className="take">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}

          {targets.length > 0 && (
            <div className="callouts targets">
              {targets.map((t) => (
                <div key={t.cat}><b>{TARGET_LABEL[t.cat]} target ({t.goal}%):</b> reached it {recordText(t.hit)} · missed it {recordText(t.missed)}</div>
              ))}
            </div>
          )}
          <p className="sub">Numbers are per game. Only games with both a score and tracked stats count in these tables.</p>
        </>
      )}
    </section>
  )
}
