import type { StatEvent, StatSummary } from '../../types'
import { fmtPct } from '../../lib/export'

export const SMALL = 5

/** Auto-generated plain-English takeaways (max 3). Careful with tiny samples. */
export function takeaways(s: StatSummary): string[] {
  const out: string[] = []
  const total = s.duels.total + s.firstContact.total + s.boxEntries.total
  if (total === 0) return ['No stats were recorded for this game yet.']

  const stats = [
    { name: 'defensive 1v1s', total: s.duels.total, pct: s.duels.winPct, good: 'won' },
    { name: 'first contact', total: s.firstContact.total, pct: s.firstContact.cleanPct, good: 'clean' },
    { name: 'box entries', total: s.boxEntries.total, pct: s.boxEntries.shotPct, good: 'ended in a shot' },
  ]
  const solid = stats.filter((x) => x.total >= SMALL && x.pct !== null)
  const small = stats.filter((x) => x.total > 0 && x.total < SMALL)

  if (solid.length >= 2) {
    const sorted = solid.slice().sort((a, b) => (b.pct as number) - (a.pct as number))
    const best = sorted[0], worst = sorted[sorted.length - 1]
    out.push(`Strongest area: ${best.name} (${fmtPct(best.pct)}). Most room to grow: ${worst.name} (${fmtPct(worst.pct)}).`)
  } else if (solid.length === 1) {
    out.push(`We got ${fmtPct(solid[0].pct)} of ${solid[0].name} ${solid[0].good}.`)
  }

  const t = s.firstContact.throughBall, l = s.firstContact.longBall
  const tt = t.clean + t.miss, lt = l.clean + l.miss
  if (tt >= 3 && lt >= 3) {
    const tp = (t.clean / tt) * 100, lp = (l.clean / lt) * 100
    if (Math.abs(tp - lp) >= 20) {
      out.push(tp > lp
        ? `Through balls were handled better (${fmtPct(tp)}) than long balls (${fmtPct(lp)}), so consider practising the first touch on long balls.`
        : `Long balls were handled better (${fmtPct(lp)}) than through balls (${fmtPct(tp)}), so consider work on reading and closing through balls.`)
    }
  }

  if (s.boxEntries.total >= SMALL) {
    const wasted = s.boxEntries.noShot
    if (wasted / s.boxEntries.total >= 0.5) out.push(`${wasted} of ${s.boxEntries.total} box entries ended without a shot, so the last pass or decision is the place to look.`)
  }

  if (small.length) out.push(`Small sample (under ${SMALL} events) for ${small.map((x) => x.name).join(' and ')}, so don't read too much into ${small.length > 1 ? 'those' : 'that'}.`)
  else if (out.length === 0) out.push('Numbers are steady across all three areas.')
  return out.slice(0, 3)
}

/** Summaries per period (1..n, extended if events exceed configured periods). */
export function periodBreakdown(events: StatEvent[], periods: number): number[] {
  const max = Math.max(periods, ...events.map((e) => e.period), 1)
  return Array.from({ length: max }, (_, i) => i + 1)
}

export function download(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'
