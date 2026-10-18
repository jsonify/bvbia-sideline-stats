import { describe, expect, it } from 'vitest'
import { cleanClock, cleanMinutes, clockText, gameMs, halfMs, halfStarted, lengthText, playedGameMs, playedMs, resetHalf, runningHalf, startHalf, stopClock } from './clock'

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
  it('runs one half at a time, stops by itself at each half\'s length, and adds the halves up into the game', () => {
    const g = { periods: 2 as const, halfMinutes: [30, 30], clock: startHalf(null, 1, at(0)) }
    expect(runningHalf(g.clock)).toBe(1)
    expect(playedMs(g, 1, t(12, 30))).toBe(12.5 * 60_000)
    expect(playedMs(g, 1, t(41))).toBe(30 * 60_000) // halftime: it stops at 30:00
    g.clock = startHalf(g.clock, 2, at(45))
    expect(runningHalf(g.clock)).toBe(2)
    expect(playedMs(g, 1, t(59))).toBe(30 * 60_000)
    expect(playedMs(g, 2, t(55))).toBe(10 * 60_000)
    expect(clockText(playedGameMs(g, t(55)))).toBe('40:00')
    expect(clockText(playedGameMs(g, t(99)))).toBe('60:00') // full time
  })

  it('without half lengths it just keeps counting until the next half or the end', () => {
    const g = { periods: 2 as const, clock: startHalf(null, 1, at(0)) }
    expect(playedMs(g, 1, t(41))).toBe(41 * 60_000)
    expect(halfMs(startHalf(g.clock, 2, at(42)), 1, t(50))).toBe(42 * 60_000)
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
