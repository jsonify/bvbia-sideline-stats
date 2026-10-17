import type { StatCategory, TeamGoals } from '../types'

export const GOAL_CATEGORIES: StatCategory[] = ['duel', 'first_contact', 'box_entry']

/** Keep only whole percentages from 1 to 100; anything else means "no target". */
export function cleanGoals(g: unknown): TeamGoals {
  const out: TeamGoals = {}
  if (!g || typeof g !== 'object') return out
  for (const c of GOAL_CATEGORIES) {
    const v = Number((g as Record<string, unknown>)[c])
    if (Number.isFinite(v) && v >= 1 && v <= 100) out[c] = Math.round(v)
  }
  return out
}

export const hasGoals = (g: TeamGoals | undefined) => !!g && GOAL_CATEGORIES.some((c) => g[c] !== undefined)

export interface GoalStatus { goal: number; met: boolean; text: string }

/**
 * How a percentage compares with its target: "Target 70% · met" / "Target 70% · 8 pts short".
 * Null when there is no target or nothing was recorded yet (an empty stat has neither met nor missed it).
 */
export function goalStatus(pct: number | null, goal: number | undefined): GoalStatus | null {
  if (goal === undefined || pct === null) return null
  const gap = Math.round(goal - pct)
  const met = gap <= 0
  return { goal, met, text: `Target ${goal}% · ${met ? 'met' : `${gap} pts short`}` }
}
