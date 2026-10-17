import type { StatCategory, StatEvent, TeamGoals } from '../../types'
import { summarize } from '../../lib/summary'
import { fmtPct } from '../../lib/export'
import { goalStatus } from '../../lib/goals'
import { periodLabel } from './insights'
import { COUNT_OF, pctOf } from './trends'

const COLS: { cat: StatCategory; head: string }[] = [
  { cat: 'duel', head: '1v1s won' },
  { cat: 'first_contact', head: 'Clean contact' },
  { cat: 'box_entry', head: 'Entries w/ shot' },
]

/**
 * Each stat for each period of a game, with a total row when `total` is set. A cell that reaches the team's
 * target gets a ✓. `periods` are the period numbers to show (1-based); `count` is how many the game has, for labels.
 */
export function PeriodTable({ events, periods, count, goals = {}, total, caption }: {
  events: StatEvent[]; periods: number[]; count: number; goals?: TeamGoals; total?: string; caption?: string
}) {
  const live = events.filter((e) => !e.deletedAt)
  const rows = periods.map((p) => ({ key: String(p), label: periodLabel(p, count), s: summarize(live.filter((e) => e.period === p)) }))
  if (total) rows.push({ key: 'total', label: total, s: summarize(live) })
  return (
    <div className="scroll"><table className="periods">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead><tr><th scope="col">{count > 2 ? 'Quarter' : 'Half'}</th>{COLS.map((c) => <th key={c.cat} scope="col">{c.head}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.key === 'total' ? 'total' : undefined}>
            <th scope="row">{r.label}</th>
            {COLS.map((c) => {
              const n = COUNT_OF[c.cat](r.s), pct = pctOf(n), st = goalStatus(pct, goals[c.cat])
              return (
                <td key={c.cat}>
                  {n.d === 0 ? '—' : <>{n.n}/{n.d} <small>{fmtPct(pct)}</small>{st?.met && <span className="met" title={st.text} aria-label={`, ${st.text}`}> ✓</span>}</>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}
