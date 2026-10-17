import { describe, expect, it } from 'vitest'
import { cleanGoals, goalStatus, hasGoals } from './goals'

describe('team targets', () => {
  it('keeps whole percentages from 1 to 100 and drops anything else', () => {
    expect(cleanGoals({ duel: 60, first_contact: '70', box_entry: 0 })).toEqual({ duel: 60, first_contact: 70 })
    expect(cleanGoals({ duel: 99.6, box_entry: 100.4, other: 50 })).toEqual({ duel: 100 })
    expect(cleanGoals(null)).toEqual({})
    expect(hasGoals({})).toBe(false)
    expect(hasGoals({ box_entry: 40 })).toBe(true)
  })
  it('says how far a number is from its target, matching the rounded number on screen', () => {
    expect(goalStatus(52, 60)).toEqual({ goal: 60, met: false, text: 'Target 60% · 8 pts short' })
    expect(goalStatus(59.6, 60)?.met).toBe(true) // shown as 60%
    expect(goalStatus(75, 60)?.text).toBe('Target 60% · met')
    expect(goalStatus(null, 60)).toBeNull()
    expect(goalStatus(50, undefined)).toBeNull()
  })
})
