import { describe, expect, it } from 'vitest'
import { cleanClock, cleanMinutes, clockText, gameMs, halfMs, halfStarted, lengthText, pauseHalf, resetHalf, runningHalf, startHalf, stopClock } from './clock'

const at = (min: number, sec = 0) => new Date(Date.UTC(2026, 9, 18, 10, min, sec)).toISOString()
const t = (min: number, sec = 0) => Date.parse(at(min, sec))

describe('half lengths', () => {
  it('takes whole minutes from 1 to 60, one per half', () => {
    expect(cleanMinutes([25, 25])).toEqual([25, 25])
    expect(cleanMinutes([30, 35])).toEqual([30, 35])
    expect(cleanMinutes([25])).toBeNull()
    expect(cleanMinutes([0, 25])).toBeNull()
    expect(cleanMinutes([25, 61])).toBeNull()
    expect(cleanMinutes([25.5, 25])).toBeNull()
    expect(cleanMinutes(null)).toBeNull()
  })

  it('says how long the game is set for', () => {
    expect(lengthText({ periods: 2, halfMinutes: [25, 25] })).toBe('2 × 25 = 50 min')
    expect(lengthText({ periods: 2, halfMinutes: [30, 35] })).toBe('30 + 35 = 65 min')
    expect(lengthText({ periods: 2 })).toBe('')
  })
})

describe('game clock', () => {
  it('runs one half at a time and adds the halves up into the game', () => {
    let c = startHalf(null, 1, at(0))
    expect(runningHalf(c)).toBe(1)
    expect(halfMs(c, 1, t(12, 30))).toBe(12.5 * 60_000)
    // Halftime: the 1st half stops at 26:10 (added time), then the 2nd half kicks off.
    c = pauseHalf(c, 1, at(26, 10))
    expect(runningHalf(c)).toBeNull()
    expect(halfMs(c, 1, t(40))).toBe((26 * 60 + 10) * 1000)
    c = startHalf(c, 2, at(35))
    expect(runningHalf(c)).toBe(2)
    expect(halfMs(c, 2, t(45))).toBe(10 * 60_000)
    expect(gameMs(c, t(45))).toBe((36 * 60 + 10) * 1000)
    expect(clockText(gameMs(c, t(45)))).toBe('36:10')
  })

  it('kicking off the 2nd half stops the 1st, and pausing then resuming keeps the time', () => {
    let c = startHalf(null, 1, at(0))
    c = startHalf(c, 2, at(25))
    expect(halfMs(c, 1, t(50))).toBe(25 * 60_000)
    c = pauseHalf(c, 2, at(30)) // an injury
    c = startHalf(c, 2, at(33))
    expect(halfMs(c, 2, t(35))).toBe(7 * 60_000)
  })

  it('stops for good when the game ends, and a half can be reset', () => {
    let c = stopClock(startHalf(null, 1, at(0)), at(20))
    expect(runningHalf(c)).toBeNull()
    expect(halfMs(c, 1, t(59))).toBe(20 * 60_000)
    expect(halfStarted(c, 1)).toBe(true)
    c = resetHalf(c, 1)
    expect(halfStarted(c, 1)).toBe(false)
    expect(gameMs(c)).toBe(0)
  })

  it('ignores junk from an old or broken copy', () => {
    expect(cleanClock('x')).toBeNull()
    expect(cleanClock([{ ms: -5, since: 'nope' }, { ms: 1000 }])).toEqual([{ ms: 0, since: null }, { ms: 1000, since: null }])
    expect(halfMs(null, 1)).toBe(0)
    expect(clockText(65 * 60_000 + 9_400)).toBe('65:09')
  })
})
