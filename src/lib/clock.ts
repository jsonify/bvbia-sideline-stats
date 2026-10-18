import type { Game, GameClock, HalfClock } from '../types'

/** The half lengths the game form offers, in minutes. Both halves are always the same length. */
export const HALF_LENGTHS = [30, 35, 45]

/** Longest half anyone would set; anything bigger is a typo. */
export const MAX_HALF_MINUTES = 60

/** A whole number of minutes per half, from 1 to MAX_HALF_MINUTES, one for each half; null when any is missing. */
export function cleanMinutes(v: unknown, periods = 2): number[] | null {
  if (!Array.isArray(v) || v.length !== periods) return null
  const ok = v.every((m) => typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= MAX_HALF_MINUTES)
  return ok ? (v as number[]) : null
}

/** One entry per half: time already played (`ms`) and, while it runs, when it was last started (`since`). */
export function cleanClock(v: unknown): GameClock | null {
  if (!Array.isArray(v)) return null
  const halves = v.map((h): HalfClock => {
    const ms = h && typeof h === 'object' ? (h as Record<string, unknown>).ms : undefined
    const since = h && typeof h === 'object' ? (h as Record<string, unknown>).since : undefined
    return {
      ms: typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0,
      since: typeof since === 'string' && !Number.isNaN(Date.parse(since)) ? since : null,
    }
  })
  return halves.length ? halves : null
}

const now = () => new Date().toISOString()
const half = (c: GameClock | null | undefined, period: number): HalfClock => cleanClock(c)?.[period - 1] ?? { ms: 0, since: null }

/** Time played in one half (1-based), counting the stretch that is running now. */
export function halfMs(c: GameClock | null | undefined, period: number, at = Date.now()): number {
  const h = half(c, period)
  return h.ms + (h.since ? Math.max(0, at - Date.parse(h.since)) : 0)
}

/** The whole game: every half added up. */
export function gameMs(c: GameClock | null | undefined, at = Date.now()): number {
  return (cleanClock(c) ?? []).reduce((sum, _, i) => sum + halfMs(c, i + 1, at), 0)
}

/** The half whose clock is running, if any. */
export function runningHalf(c: GameClock | null | undefined): number | null {
  const i = (cleanClock(c) ?? []).findIndex((h) => h.since)
  return i < 0 ? null : i + 1
}

/** Has this half been started at all? */
export const halfStarted = (c: GameClock | null | undefined, period: number) => { const h = half(c, period); return h.ms > 0 || !!h.since }

/** Stop every running half, keeping the time it ran. */
export function stopClock(c: GameClock | null | undefined, at = now()): GameClock {
  const t = Date.parse(at)
  return (cleanClock(c) ?? []).map((h) => (h.since ? { ms: h.ms + Math.max(0, t - Date.parse(h.since)), since: null } : h))
}

/** Start (or resume) one half. Only one half runs at a time, so kicking off the 2nd half stops the 1st. */
export function startHalf(c: GameClock | null | undefined, period: number, at = now()): GameClock {
  const next = stopClock(c, at)
  while (next.length < period) next.push({ ms: 0, since: null })
  next[period - 1] = { ...next[period - 1], since: at }
  return next
}

/** Pause one half (an injury, or it was started too early). */
export function pauseHalf(c: GameClock | null | undefined, period: number, at = now()): GameClock {
  const next = cleanClock(c) ?? []
  const h = next[period - 1]
  if (!h?.since) return next
  next[period - 1] = { ms: h.ms + Math.max(0, Date.parse(at) - Date.parse(h.since)), since: null }
  return next
}

/** Put one half back to 0:00 (and stopped). */
export function resetHalf(c: GameClock | null | undefined, period: number): GameClock {
  const next = cleanClock(c) ?? []
  if (next[period - 1]) next[period - 1] = { ms: 0, since: null }
  return next
}

/** "12:05". Whole seconds, minutes can go past 59 for the full game. */
export function clockText(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "2 × 25 = 50 min" or "25 + 30 = 55 min". Empty when the halves aren't set. */
export function lengthText(g: Pick<Game, 'halfMinutes' | 'periods'>): string {
  const m = cleanMinutes(g.halfMinutes, g.periods)
  if (!m) return ''
  const total = m.reduce((a, b) => a + b, 0)
  return m.every((x) => x === m[0]) ? `${m.length} × ${m[0]} = ${total} min` : `${m.join(' + ')} = ${total} min`
}
