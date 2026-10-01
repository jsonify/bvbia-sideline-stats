import { describe, expect, it } from 'vitest'
import type { StatCategory } from '../types'
import { LANES, LANE_OF, ROLES, ROLE_LANES, lanesText, roleOf } from './lanes'

describe('lanes', () => {
  it('puts every stat in exactly one lane, and every lane has at least one stat', () => {
    const categories: StatCategory[] = ['duel', 'first_contact', 'box_entry']
    for (const c of categories) expect(LANES).toContain(LANE_OF[c])
    for (const l of LANES) expect(categories.some((c) => LANE_OF[c] === l)).toBe(true)
  })

  it('splits the original stats the way the coach described: 1v1s on defense, box entries on offense', () => {
    expect(LANE_OF.duel).toBe('defense')
    expect(LANE_OF.box_entry).toBe('offense')
  })

  it('a role is the set of lanes it covers, and every lane is covered by "all"', () => {
    expect(ROLE_LANES.all).toEqual([...LANES])
    for (const r of ROLES) expect(roleOf(ROLE_LANES[r])).toBe(r)
    expect(roleOf([])).toBeNull()
    expect(roleOf(['offense', 'defense'])).toBe('all') // order does not matter
  })

  it('says it in words', () => {
    expect(lanesText(['defense', 'offense'])).toBe('everything')
    expect(lanesText(['offense'])).toBe('offense')
    expect(lanesText([])).toBe('nothing')
  })
})
