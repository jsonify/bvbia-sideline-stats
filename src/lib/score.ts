import type { Game, GameScore } from '../types'

export type Result = 'W' | 'D' | 'L'

/** Most goals one side can have; anything bigger is a typo. */
export const MAX_GOALS = 99

/** A whole number of goals from 0 to MAX_GOALS for each side, or null (no score). */
export function cleanScore(s: unknown): GameScore | null {
  if (!s || typeof s !== 'object') return null
  const { us, them } = s as Record<string, unknown>
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_GOALS
  return ok(us) && ok(them) ? { us, them } : null
}

/** Win, draw or loss, from our side. Null when the score isn't in. */
export function resultOf(g: Pick<Game, 'score'>): Result | null {
  const s = cleanScore(g.score)
  if (!s) return null
  return s.us > s.them ? 'W' : s.us < s.them ? 'L' : 'D'
}

export const RESULT_WORD: Record<Result, string> = { W: 'Win', D: 'Draw', L: 'Loss' }

/** "3–1" (ours first). Empty when the score isn't in. */
export const scoreText = (g: Pick<Game, 'score'>) => {
  const s = cleanScore(g.score)
  return s ? `${s.us}–${s.them}` : ''
}
