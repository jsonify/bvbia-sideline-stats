import { describe, expect, it } from 'vitest'
import type { Game, StatEvent } from '../types'
import { csvCell, eventsToCsv, gameSummaryToText, seasonToCsv } from './export'
import { summarize } from './summary'

const game = (id: string, opponent: string, date: string): Game => ({
  id, teamId: 't', opponent, date, home: true, periods: 2, status: 'final', createdAt: '', updatedAt: '',
})
let n = 0
const ev = (gameId: string, o: Partial<StatEvent> & Record<string, unknown>): StatEvent =>
  ({ id: `e${n++}`, gameId, period: 1, createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`, ...o }) as StatEvent

describe('csvCell', () => {
  it('escapes commas, quotes, newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('x\ny')).toBe('"x\ny"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(0)).toBe('0')
  })
  it('neutralises formulas in text cells', () => {
    expect(csvCell('=SUM(A1)', { text: true })).toBe("'=SUM(A1)")
  })
})

describe('eventsToCsv', () => {
  const games = [game('g2', 'Lions, FC', '2026-02-01'), game('g1', 'Bears', '2026-01-01')]
  const events = [
    ev('g2', { category: 'duel', outcome: 'won' }),
    ev('g1', { category: 'first_contact', outcome: 'clean', ballType: 'long_ball' }),
    ev('g1', { category: 'duel', outcome: 'lost', deletedAt: 'x' }),
  ]
  it('has header, skips deleted, sorts by date, escapes', () => {
    const lines = eventsToCsv(events, games).trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('game_id,date,opponent,period,category,outcome,ball_type,recorded_at')
    expect(lines[1]).toContain('g1,2026-01-01,Bears,1,first_contact,clean,long_ball')
    expect(lines[2]).toContain('"Lions, FC"')
  })
  it('handles empty', () => {
    expect(eventsToCsv([], [])).toBe('game_id,date,opponent,period,category,outcome,ball_type,recorded_at\r\n')
  })
})

describe('seasonToCsv', () => {
  it('one row per game with blank pct when no events', () => {
    const games = [game('g1', 'Bears', '2026-01-01'), game('g2', 'Lions', '2026-01-08')]
    const events = [ev('g1', { category: 'duel', outcome: 'won' }), ev('g1', { category: 'duel', outcome: 'lost' })]
    const lines = seasonToCsv(games, events).trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('Bears,final,1,2,50,0,0,,0,0,')
    expect(lines[2]).toBe('2026-01-08,Lions,final,0,0,,0,0,,0,0,')
  })
})

describe('gameSummaryToText', () => {
  it('formats numbers and handles empty', () => {
    const t = gameSummaryToText({ opponent: 'Bears', date: '2026-01-01' }, summarize([
      ev('g1', { category: 'duel', outcome: 'won' }), ev('g1', { category: 'duel', outcome: 'won' }), ev('g1', { category: 'duel', outcome: 'lost' }),
    ]), ['Nice.'])
    expect(t).toContain('Defensive 1v1s won: 67% (2 of 3)')
    expect(t).toContain('Clean first contact: no events')
    expect(t.endsWith('Nice.')).toBe(true)
  })
})
