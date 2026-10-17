import type { Game, StatCategory, StatSummary } from '../../types'

/** One stat's count in one game (or several, pooled): n good outcomes out of d. */
export interface Count { n: number; d: number }

export const pctOf = ({ n, d }: Count) => (d === 0 ? null : Math.round((n / d) * 1000) / 10)
const pool = (cs: Count[]): Count => cs.reduce((a, c) => ({ n: a.n + c.n, d: a.d + c.d }), { n: 0, d: 0 })

/** The count behind each stat's headline percentage. */
export const COUNT_OF: Record<StatCategory, (s: StatSummary) => Count> = {
  duel: (s) => ({ n: s.duels.won, d: s.duels.total }),
  first_contact: (s) => ({ n: s.firstContact.clean, d: s.firstContact.total }),
  box_entry: (s) => ({ n: s.boxEntries.shot, d: s.boxEntries.total }),
}

/** Games in a row that count as "recent form". */
export const RECENT = 3
/** Fewest events, on each side, before recent form is worth a sentence. */
export const FORM_MIN = 5

export interface Form { recent: Count; before: Count; recentPct: number; beforePct: number; delta: number; games: number }

/**
 * The last few games that have this stat, pooled, against every game before them, pooled. Pooling (not averaging
 * percentages) means a game with 2 events can't swing the number as much as one with 20.
 * Null until there are earlier games to compare with and enough events on both sides.
 */
export function recentForm(counts: Count[], k = RECENT): Form | null {
  const played = counts.filter((c) => c.d > 0)
  if (played.length <= k) return null
  const recent = pool(played.slice(-k)), before = pool(played.slice(0, -k))
  if (recent.d < FORM_MIN || before.d < FORM_MIN) return null
  const recentPct = pctOf(recent) as number, beforePct = pctOf(before) as number
  return { recent, before, recentPct, beforePct, delta: Math.round(recentPct - beforePct), games: k }
}

/** "up 8 pts" / "down 3 pts" / "level". */
export const deltaText = (delta: number) => (delta === 0 ? 'level' : `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} pts`)

/**
 * For each game, the pooled percentage over it and the games before it, up to `k` games that have this stat.
 * A game without the stat gets null (no point on the line), but doesn't break the run.
 */
export function rollingPct(counts: Count[], k = RECENT): (number | null)[] {
  const seen: Count[] = []
  return counts.map((c) => {
    if (c.d === 0) return null
    seen.push(c)
    return pctOf(pool(seen.slice(-k)))
  })
}

/** Opponent names typed on different phones ("Bears", " bears ") still match. */
export const opponentKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export interface OpponentRow { name: string; games: Game[]; counts: Record<StatCategory, Count> }

/** The name to show for a group: the most recent spelling that starts with a capital ("Bears" over "bears"). */
function spelling(names: string[]) {
  const t = names.map((n) => n.trim().replace(/\s+/g, ' '))
  return [...t].reverse().find((n) => /^\p{Lu}/u.test(n)) ?? t[t.length - 1]
}

/** Every opponent the team has stats against, with each stat pooled over those games. Most played first, then by name. */
export function byOpponent(rows: { game: Game; s: StatSummary }[]): OpponentRow[] {
  const groups = new Map<string, { game: Game; s: StatSummary }[]>()
  for (const r of rows) {
    const k = opponentKey(r.game.opponent)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()].map((rs) => ({
    name: spelling(rs.map((r) => r.game.opponent)),
    games: rs.map((r) => r.game),
    counts: Object.fromEntries((Object.keys(COUNT_OF) as StatCategory[]).map((c) => [c, pool(rs.map((r) => COUNT_OF[c](r.s)))])) as Record<StatCategory, Count>,
  })).sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name))
}
