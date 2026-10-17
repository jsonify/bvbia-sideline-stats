import { describe, expect, it } from 'vitest'
import type { Game } from '../../types'
import { summarize } from '../../lib/summary'
import { byOpponent, deltaText, opponentKey, recentForm, rollingPct } from './trends'

const c = (n: number, d: number) => ({ n, d })

describe('trends', () => {
  it('pools the last 3 games that have the stat against every game before them', () => {
    const f = recentForm([c(2, 10), c(0, 0), c(3, 10), c(6, 10), c(7, 10), c(8, 10)])!
    expect(f.before).toEqual({ n: 5, d: 20 })
    expect(f.recent).toEqual({ n: 21, d: 30 })
    expect(f.beforePct).toBe(25)
    expect(f.recentPct).toBe(70)
    expect(f.delta).toBe(45)
    expect(deltaText(f.delta)).toBe('up 45 pts')
    expect(deltaText(-3)).toBe('down 3 pts')
    expect(deltaText(0)).toBe('level')
  })
  it('needs earlier games and enough events on both sides before it says anything', () => {
    expect(recentForm([c(1, 2), c(2, 3), c(3, 4)])).toBeNull() // nothing to compare with
    expect(recentForm([c(1, 2), c(5, 10), c(5, 10), c(5, 10)])).toBeNull() // 2 earlier events is too few
  })
  it('draws a 3-game average that skips games without the stat', () => {
    expect(rollingPct([c(1, 2), c(0, 0), c(3, 4), c(0, 4), c(4, 4)])).toEqual([50, null, 66.7, 40, 58.3])
  })
  it('groups games by opponent however the name was typed', () => {
    expect(opponentKey('  Lake  City ')).toBe(opponentKey('lake city'))
    const g = (id: string, opponent: string, date: string): Game =>
      ({ id, teamId: 't', opponent, date, home: true, periods: 2, status: 'final', createdAt: '', updatedAt: '' })
    const duel = (won: number, lost: number) => summarize([
      ...Array.from({ length: won }, (_, i) => ({ id: `w${i}`, gameId: 'x', category: 'duel', outcome: 'won', period: 1, createdAt: '' }) as const),
      ...Array.from({ length: lost }, (_, i) => ({ id: `l${i}`, gameId: 'x', category: 'duel', outcome: 'lost', period: 1, createdAt: '' }) as const),
    ])
    const rows = byOpponent([
      { game: g('1', 'bears', '2026-01-01'), s: duel(1, 3) },
      { game: g('2', 'Hawks', '2026-01-08'), s: duel(2, 0) },
      { game: g('3', 'Bears ', '2026-01-15'), s: duel(3, 1) },
    ])
    expect(rows.map((r) => [r.name, r.games.length, r.counts.duel])).toEqual([
      ['Bears', 2, { n: 4, d: 8 }],
      ['Hawks', 1, { n: 2, d: 2 }],
    ])
  })
})
