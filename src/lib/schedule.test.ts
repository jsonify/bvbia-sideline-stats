import { describe, expect, it } from 'vitest'
import type { Game } from '../types'
import { byMonth, bySchedule, cleanKickoff, gameToAnnounce, nextGame, nextWeek } from './schedule'

const g = (id: string, date: string, kickoff?: string, status: Game['status'] = 'scheduled'): Game =>
  ({ id, teamId: 't', opponent: id, date, kickoff, home: true, periods: 2, status, createdAt: id, updatedAt: id })

describe('schedule helpers', () => {
  it('cleans kick-off times, including Postgres "HH:MM:SS"', () => {
    expect(cleanKickoff('10:30')).toBe('10:30')
    expect(cleanKickoff('9:05:00')).toBe('09:05')
    expect(cleanKickoff('25:00')).toBeNull()
    expect(cleanKickoff('')).toBeNull()
    expect(cleanKickoff(null)).toBeNull()
  })

  it('orders by date, then kick-off', () => {
    const list = [g('c', '2026-10-24', '14:00'), g('a', '2026-10-17'), g('b', '2026-10-24', '09:00')].sort(bySchedule)
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('adds a week, across months', () => {
    expect(nextWeek('2026-10-28')).toBe('2026-11-04')
  })

  it('groups the season by month and finds the next game', () => {
    const games = [g('nov', '2026-11-07'), g('oct2', '2026-10-24'), g('oct1', '2026-10-10', undefined, 'final'), g('missed', '2026-10-12')]
    expect(byMonth(games).map((m) => [m.key, m.games.map((x) => x.id)])).toEqual([
      ['2026-10', ['oct1', 'missed', 'oct2']], ['2026-11', ['nov']],
    ])
    expect(nextGame(games, '2026-10-18')?.id).toBe('oct2')
  })
})

describe('gameToAnnounce', () => {
  it('is the game being played now, if there is one', () => {
    expect(gameToAnnounce([g('next', '2026-10-25'), g('now', '2026-10-24', undefined, 'live')], '2026-10-24')?.id).toBe('now')
  })
  it('otherwise the next game on the calendar, or none', () => {
    expect(gameToAnnounce([g('old', '2026-10-01', undefined, 'final'), g('next', '2026-10-25')], '2026-10-24')?.id).toBe('next')
    expect(gameToAnnounce([g('old', '2026-10-01', undefined, 'final')], '2026-10-24')).toBeNull()
  })
})
