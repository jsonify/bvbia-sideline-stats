import { describe, expect, it } from 'vitest'
import { BOX_ZONES, DEFENSE_ZONES, ZONES, attacksLeft, isZone, zoneFits, zoneText } from './zones'

describe('zones', () => {
  it('has six zones in our half and six in their box', () => {
    expect(DEFENSE_ZONES).toHaveLength(6)
    expect(BOX_ZONES).toHaveLength(6)
    expect(new Set(ZONES).size).toBe(12)
  })
  it('only fits a zone to the stats played there', () => {
    expect(zoneFits('box_entry', 'near_c')).toBe(true)
    expect(zoneFits('box_entry', 'def_l')).toBe(false)
    expect(zoneFits('duel', 'mid_r')).toBe(true)
    expect(zoneFits('first_contact', 'edge_l')).toBe(false)
  })
  it('reads out a zone', () => {
    expect(zoneText('def_l')).toBe('Left, deep in our half')
    expect(zoneText('near_c')).toBe('Centre, close to goal')
  })
  it('recognises zones', () => {
    expect(isZone('edge_r')).toBe(true)
    expect(isZone('box')).toBe(false)
    expect(isZone(null)).toBe(false)
  })
  it('turns the field round for the second half, and back when swapped', () => {
    expect([1, 2].map((p) => attacksLeft(p, 2, false))).toEqual([false, true])
    expect([1, 2, 3, 4].map((p) => attacksLeft(p, 4, false))).toEqual([false, false, true, true])
    expect([1, 2].map((p) => attacksLeft(p, 2, true))).toEqual([true, false])
  })
})
