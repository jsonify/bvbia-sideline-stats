import type { StatEvent } from '../../types'

export function eventLabel(e: Pick<StatEvent, 'category' | 'outcome'> & { ballType?: string }): string {
  switch (e.category) {
    case 'duel':
      return `1v1 · ${e.outcome === 'won' ? 'Won' : 'Lost'}`
    case 'first_contact':
      return `${e.ballType === 'long_ball' ? 'Long ball' : 'Through ball'} · ${e.outcome === 'clean' ? 'Clean' : 'Miss'}`
    default:
      return `Box entry · ${e.outcome === 'shot' ? 'Shot' : 'No shot'}`
  }
}

export const isGood = (e: StatEvent) => e.outcome === 'won' || e.outcome === 'clean' || e.outcome === 'shot'

export function tallyText(good: number, total: number, pct: number | null): string {
  return total === 0 ? 'No taps yet' : `${good} of ${total} · ${Math.round(pct ?? 0)}%`
}
