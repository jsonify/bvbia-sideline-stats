import type { StatEvent, StatSummary } from '../types'

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10)

/** Single source of truth for all derived numbers. Ignores soft-deleted events. */
export function summarize(events: StatEvent[]): StatSummary {
  const live = events.filter((e) => !e.deletedAt)
  const s: StatSummary = {
    duels: { won: 0, lost: 0, total: 0, winPct: null },
    firstContact: {
      clean: 0, miss: 0, total: 0, cleanPct: null,
      throughBall: { clean: 0, miss: 0 }, longBall: { clean: 0, miss: 0 },
    },
    boxEntries: { shot: 0, noShot: 0, total: 0, shotPct: null },
  }
  for (const e of live) {
    if (e.category === 'duel') e.outcome === 'won' ? s.duels.won++ : s.duels.lost++
    else if (e.category === 'first_contact') {
      const bucket = e.ballType === 'through_ball' ? s.firstContact.throughBall : s.firstContact.longBall
      if (e.outcome === 'clean') { s.firstContact.clean++; bucket.clean++ } else { s.firstContact.miss++; bucket.miss++ }
    } else e.outcome === 'shot' ? s.boxEntries.shot++ : s.boxEntries.noShot++
  }
  s.duels.total = s.duels.won + s.duels.lost
  s.duels.winPct = pct(s.duels.won, s.duels.total)
  s.firstContact.total = s.firstContact.clean + s.firstContact.miss
  s.firstContact.cleanPct = pct(s.firstContact.clean, s.firstContact.total)
  s.boxEntries.total = s.boxEntries.shot + s.boxEntries.noShot
  s.boxEntries.shotPct = pct(s.boxEntries.shot, s.boxEntries.total)
  return s
}
