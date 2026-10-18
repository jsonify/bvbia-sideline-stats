import type { Game, StatCategory, StatSummary, TeamGoals } from '../../types'
import { goalStatus } from '../../lib/goals'
import { cleanScore, resultOf, type Result } from '../../lib/score'
import { COUNT_OF, FORM_MIN, pctOf, type Count } from './trends'

type Row = { game: Game; s: StatSummary }

const CATS = Object.keys(COUNT_OF) as StatCategory[]
const RESULTS: Result[] = ['W', 'D', 'L']
const LABEL: Record<StatCategory, string> = { duel: '1v1s won', first_contact: 'clean first contact', box_entry: 'box entries with a shot' }

export interface Record3 { W: number; D: number; L: number }
export interface SeasonRecord extends Record3 { games: number; scored: number; conceded: number }

/** Wins, draws and losses, and goals both ways, over every game that has a score. Null before any score is in. */
export function seasonRecord(games: Game[]): SeasonRecord | null {
  const r: SeasonRecord = { W: 0, D: 0, L: 0, games: 0, scored: 0, conceded: 0 }
  for (const g of games) {
    const s = cleanScore(g.score), res = resultOf(g)
    if (!s || !res) continue
    r[res]++; r.games++; r.scored += s.us; r.conceded += s.them
  }
  return r.games ? r : null
}

export const recordText = (r: Record3) => `${r.W}W ${r.D}D ${r.L}L`

/** One result (wins, draws or losses), over the games with both a score and stats. Per-game numbers are averages. */
export interface ResultGroup {
  result: Result
  games: number
  scored: number // goals for, a game
  conceded: number // goals against, a game
  entries: number // box entries, a game
  shots: number // box entries with a shot, a game
  counts: Record<StatCategory, Count> // each stat pooled over these games
}

const per = (total: number, games: number) => Math.round((total / games) * 10) / 10

/** Games grouped by result, wins first. A result nobody has had yet is left out. */
export function resultGroups(rows: Row[]): ResultGroup[] {
  return RESULTS.map((result) => {
    const rs = rows.filter((r) => resultOf(r.game) === result)
    const sum = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0)
    return {
      result,
      games: rs.length,
      scored: per(sum((r) => cleanScore(r.game.score)!.us), rs.length),
      conceded: per(sum((r) => cleanScore(r.game.score)!.them), rs.length),
      entries: per(sum((r) => r.s.boxEntries.total), rs.length),
      shots: per(sum((r) => r.s.boxEntries.shot), rs.length),
      counts: Object.fromEntries(CATS.map((c) => [c, rs.reduce((a, r) => {
        const x = COUNT_OF[c](r.s)
        return { n: a.n + x.n, d: a.d + x.d }
      }, { n: 0, d: 0 })])) as Record<StatCategory, Count>,
    }
  }).filter((g) => g.games > 0)
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/**
 * Plain sentences on what was different in wins and in losses: each stat with enough events on both sides, the biggest
 * gap first, then how much the attack produced. Empty until there is at least one win and one loss to compare.
 */
export function resultNotes(groups: ResultGroup[]): string[] {
  const w = groups.find((g) => g.result === 'W'), l = groups.find((g) => g.result === 'L')
  if (!w || !l) return []
  const gaps = CATS
    .filter((c) => w.counts[c].d >= FORM_MIN && l.counts[c].d >= FORM_MIN)
    .map((c) => { const wp = pctOf(w.counts[c]) as number, lp = pctOf(l.counts[c]) as number; return { c, wp, lp, gap: Math.round(wp - lp) } })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  const notes = gaps.map(({ c, wp, lp, gap }) => {
    const label = LABEL[c][0].toUpperCase() + LABEL[c].slice(1)
    const how = gap === 0 ? 'no different from' : `${Math.abs(gap)} pts ${gap > 0 ? 'higher than' : 'lower than'}`
    return `${label}: ${Math.round(wp)}% in wins, ${how} in losses (${Math.round(lp)}%).`
  })
  if (w.entries + l.entries > 0)
    notes.push(`Attack: ${num(w.entries)} box entries and ${num(w.shots)} shots a game in wins, ${num(l.entries)} and ${num(l.shots)} in losses.`)
  return notes
}

export interface TargetRecord { cat: StatCategory; goal: number; hit: Record3; missed: Record3 }

/**
 * For each stat with a target: the record in games where the team reached it, and where it didn't.
 * Only games with a score and that stat count; a stat needs two such games to say anything.
 */
export function targetRecords(rows: Row[], goals: TeamGoals): TargetRecord[] {
  return CATS.flatMap((cat) => {
    const goal = goals[cat]
    if (goal === undefined) return []
    const hit: Record3 = { W: 0, D: 0, L: 0 }, missed: Record3 = { W: 0, D: 0, L: 0 }
    let n = 0
    for (const r of rows) {
      const res = resultOf(r.game), p = pctOf(COUNT_OF[cat](r.s))
      if (!res || p === null) continue
      ;(goalStatus(p, goal)!.met ? hit : missed)[res]++
      n++
    }
    return n >= 2 ? [{ cat, goal, hit, missed }] : []
  })
}
