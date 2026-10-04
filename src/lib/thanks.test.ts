import { describe, expect, it } from 'vitest'
import type { GameThanks } from '../data/repository'
import { canThank, heartsFor, thanksNames } from './thanks'

let t = 0
const heart = (name: string | null, mine = false, gameId = 'g1'): GameThanks => ({ gameId, name, mine, createdAt: `2026-01-01T00:00:${String(t++).padStart(2, '0')}Z` })

describe('thanksNames', () => {
  it('is empty with no hearts', () => expect(thanksNames([])).toBe(''))
  it('names one, two and three parents', () => {
    expect(thanksNames([heart('Sam')])).toBe('Sam')
    expect(thanksNames([heart('Sam'), heart('Priya')])).toBe('Sam and Priya')
    expect(thanksNames([heart('Sam'), heart('Priya'), heart('Lee')])).toBe('Sam, Priya and Lee')
  })
  it('puts you first, whatever order the hearts came in', () => {
    expect(thanksNames([heart('Sam'), heart('Priya', true)])).toBe('You and Sam')
    expect(thanksNames([heart('Sam'), heart(null, true), heart('Lee')])).toBe('You, Sam and Lee')
  })
  it('counts parents who set no name instead of naming them', () => {
    expect(thanksNames([heart(null)])).toBe('a parent')
    expect(thanksNames([heart(null), heart(null)])).toBe('2 parents')
    expect(thanksNames([heart('Sam'), heart(null), heart(null)])).toBe('Sam and 2 parents')
    expect(thanksNames([heart(null, true), heart(null)])).toBe('You and a parent')
  })
  it('keeps a long list short: two names, then how many more', () => {
    const many = ['Sam', 'Priya', 'Lee', 'Ana', 'Jo'].map((n) => heart(n))
    expect(thanksNames(many)).toBe('Sam, Priya and 3 others')
    expect(thanksNames([...many.slice(0, 3), heart(null), heart(null)])).toBe('Sam, Priya and 3 others')
    expect(thanksNames([heart(null, true), ...many.slice(0, 3)])).toBe('You, Sam and 2 others')
  })
})

describe('heartsFor / canThank', () => {
  it('picks one game\'s hearts', () => {
    const all = [heart('Sam'), heart('Priya', false, 'g2'), heart('Lee')]
    expect(heartsFor(all, 'g1').map((h) => h.name)).toEqual(['Sam', 'Lee'])
    expect(heartsFor(all, 'none')).toEqual([])
  })
  it('allows live and final games, not upcoming ones', () => {
    expect([canThank('scheduled'), canThank('live'), canThank('final')]).toEqual([false, true, true])
  })
})
