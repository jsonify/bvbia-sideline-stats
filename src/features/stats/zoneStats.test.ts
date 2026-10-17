import { describe, expect, it } from 'vitest'
import type { StatEvent } from '../../types'
import { tallyBy, zonedEvents, zoneNotes } from './zoneStats'

let n = 0
const ev = (category: string, outcome: string, zone: string | null, extra: object = {}) =>
  ({ id: `e${n++}`, gameId: 'g', category, outcome, period: 1, createdAt: '2026-01-01T00:00:00Z', zone, ...extra }) as StatEvent
const many = (k: number, category: string, outcome: string, zone: string | null) => Array.from({ length: k }, () => ev(category, outcome, zone))

describe('zonedEvents / tallyBy', () => {
  it('keeps only live taps of the stat with a zone that fits it', () => {
    const events = [
      ev('duel', 'won', 'def_l'), ev('duel', 'lost', null), ev('duel', 'lost', 'near_c'), // box zone: doesn't fit a 1v1
      ev('duel', 'lost', 'mid_r', { deletedAt: 'x' }), ev('box_entry', 'shot', 'edge_c'),
    ]
    expect(zonedEvents(events, 'duel').map((e) => e.zone)).toEqual(['def_l'])
    expect(zonedEvents(events, 'box_entry')).toHaveLength(1)
  })
  it('counts good outcomes out of taps per group', () => {
    const t = tallyBy([ev('duel', 'won', 'def_l'), ev('duel', 'lost', 'mid_l'), ev('duel', 'won', 'def_c')], (z) => z.slice(-1))
    expect(t.get('l')).toEqual({ n: 1, d: 2 })
    expect(t.get('c')).toEqual({ n: 1, d: 1 })
  })
})

describe('zoneNotes', () => {
  it('says nothing for button taps or tiny samples', () => {
    expect(zoneNotes([...many(8, 'duel', 'lost', null)])).toEqual([])
    expect(zoneNotes([...many(4, 'duel', 'lost', 'def_l')])).toEqual([]) // under 5 zoned 1v1s
  })
  it('names the one zone where most 1v1s were lost', () => {
    const notes = zoneNotes([...many(3, 'duel', 'lost', 'def_l'), ev('duel', 'won', 'def_l'), ev('duel', 'lost', 'mid_r'), ...many(2, 'duel', 'won', 'def_c')])
    expect(notes).toEqual(['3 of our 4 lost 1v1s came on the left, deep in our half (we won 1 of 4 there), so that is the area to cover.'])
  })
  it('falls back to a side when the losses are spread down it', () => {
    const notes = zoneNotes([...many(2, 'duel', 'lost', 'def_r'), ...many(2, 'duel', 'lost', 'mid_r'), ev('duel', 'lost', 'def_l'), ...many(3, 'duel', 'won', 'def_c')])
    expect(notes[0]).toMatch(/^4 of our 5 lost 1v1s came on the right \(we won 0 of 4 there\)/)
  })
  it('falls back to a depth for missed first contacts spread across the field', () => {
    const notes = zoneNotes([
      ev('first_contact', 'miss', 'def_l', { ballType: 'long_ball' }), ev('first_contact', 'miss', 'def_c', { ballType: 'long_ball' }),
      ev('first_contact', 'miss', 'def_r', { ballType: 'long_ball' }), ev('first_contact', 'clean', 'mid_c', { ballType: 'long_ball' }),
      ev('first_contact', 'clean', 'def_c', { ballType: 'long_ball' }),
    ])
    expect(notes).toEqual(['All 3 missed first contacts came deep in our half (1 of 4 clean there).'])
  })
  it('compares box entries through the centre with the wings', () => {
    expect(zoneNotes([...many(3, 'box_entry', 'shot', 'near_c'), ev('box_entry', 'no_shot', 'edge_c'), ...many(3, 'box_entry', 'no_shot', 'edge_l'), ev('box_entry', 'shot', 'edge_r')]))
      .toEqual(['Box entries through the centre ended in a shot more often (3 of 4) than from the wings (1 of 4).'])
  })
  it('otherwise says which side most box entries came down', () => {
    expect(zoneNotes([...many(2, 'box_entry', 'shot', 'edge_l'), ...many(2, 'box_entry', 'no_shot', 'near_l'), ev('box_entry', 'shot', 'edge_c')]))
      .toEqual(['Most box entries came down the left (4 of 5, 2 with a shot).'])
  })
})
