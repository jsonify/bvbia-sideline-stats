import type { Game, StatEvent, StatSummary } from '../types'
import { summarize } from './summary'

/** RFC 4180 escaping; also neutralises spreadsheet formula injection for text cells. */
export function csvCell(v: string | number | null | undefined, opts: { text?: boolean } = {}): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (opts.text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvRow = (cells: (string | number | null | undefined)[]) => cells.map((c) => csvCell(c)).join(',')

const CATEGORY_LABEL: Record<string, string> = { duel: 'Defensive 1v1', first_contact: 'First contact', box_entry: 'Box entry' }
const OUTCOME_LABEL: Record<string, string> = {
  won: 'Won', lost: 'Lost', clean: 'Clean', miss: 'Missed', shot: 'Shot', no_shot: 'No shot',
}
export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c
export const outcomeLabel = (o: string) => OUTCOME_LABEL[o] ?? o

/** One row per (non-deleted) event with game/opponent/date columns, ordered by game date then time. */
export function eventsToCsv(events: StatEvent[], games: Game[]): string {
  const byId = new Map(games.map((g) => [g.id, g]))
  const rows = events
    .filter((e) => !e.deletedAt)
    .slice()
    .sort((a, b) => {
      const da = byId.get(a.gameId)?.date ?? '', db = byId.get(b.gameId)?.date ?? ''
      return da.localeCompare(db) || a.gameId.localeCompare(b.gameId) || a.createdAt.localeCompare(b.createdAt)
    })
  const out = [csvRow(['game_id', 'date', 'opponent', 'period', 'category', 'outcome', 'ball_type', 'recorded_at'])]
  for (const e of rows) {
    const g = byId.get(e.gameId)
    out.push([
      csvCell(e.gameId), csvCell(g?.date), csvCell(g?.opponent, { text: true }), csvCell(e.period),
      csvCell(e.category), csvCell(e.outcome), csvCell(e.category === 'first_contact' ? e.ballType : ''),
      csvCell(e.createdAt),
    ].join(','))
  }
  return out.join('\r\n') + '\r\n'
}

export const fmtPct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${Math.round(p)}%`)

/** Per-game summary CSV (one row per game, in date order). */
export function seasonToCsv(games: Game[], events: StatEvent[]): string {
  const sorted = games.slice().sort((a, b) => a.date.localeCompare(b.date))
  const out = [csvRow([
    'date', 'opponent', 'status', 'duels_won', 'duels_total', 'duel_win_pct',
    'first_contact_clean', 'first_contact_total', 'first_contact_clean_pct',
    'box_entries_shot', 'box_entries_total', 'box_entry_shot_pct',
  ])]
  for (const g of sorted) {
    const s = summarize(events.filter((e) => e.gameId === g.id))
    out.push([
      csvCell(g.date), csvCell(g.opponent, { text: true }), csvCell(g.status),
      s.duels.won, s.duels.total, s.duels.winPct ?? '',
      s.firstContact.clean, s.firstContact.total, s.firstContact.cleanPct ?? '',
      s.boxEntries.shot, s.boxEntries.total, s.boxEntries.shotPct ?? '',
    ].map((c) => csvCell(c)).join(','))
  }
  return out.join('\r\n') + '\r\n'
}

/** Plain-text summary suitable for sharing in a team chat. */
export function gameSummaryToText(game: Pick<Game, 'opponent' | 'date'>, s: StatSummary, takeaways: string[] = []): string {
  const line = (label: string, n: number, d: number, p: number | null) =>
    `${label}: ${d === 0 ? 'no events' : `${fmtPct(p)} (${n} of ${d})`}`
  const lines = [
    `Game summary vs ${game.opponent} (${game.date})`,
    line('Defensive 1v1s won', s.duels.won, s.duels.total, s.duels.winPct),
    line('Clean first contact', s.firstContact.clean, s.firstContact.total, s.firstContact.cleanPct),
    `  Through balls: ${s.firstContact.throughBall.clean} of ${s.firstContact.throughBall.clean + s.firstContact.throughBall.miss} clean`,
    `  Long balls: ${s.firstContact.longBall.clean} of ${s.firstContact.longBall.clean + s.firstContact.longBall.miss} clean`,
    line('Box entries with a shot', s.boxEntries.shot, s.boxEntries.total, s.boxEntries.shotPct),
  ]
  if (takeaways.length) lines.push('', ...takeaways)
  return lines.join('\n')
}
