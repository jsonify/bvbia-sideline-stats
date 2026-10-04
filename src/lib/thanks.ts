import type { GameThanks } from '../data/repository'

/** A game that has started (live or final) can be thanked; one still on the calendar can't. */
export const canThank = (status: 'scheduled' | 'live' | 'final') => status !== 'scheduled'

/** The hearts on one game. */
export const heartsFor = (all: GameThanks[], gameId: string) => all.filter((t) => t.gameId === gameId)

/**
 * Who gave their thanks, as a short phrase: "You", "Sam and Priya", "You, Sam and 2 parents", "Sam, Priya and 5 others".
 * Parents who haven't set a name count as "a parent" / "N parents". Empty when there are no hearts.
 */
export function thanksNames(hearts: GameThanks[]): string {
  const sorted = [...hearts].sort((a, b) => Number(b.mine) - Number(a.mine) || a.createdAt.localeCompare(b.createdAt))
  const named = sorted.map((t) => (t.mine ? 'You' : t.name)).filter((n): n is string => !!n)
  const unnamed = sorted.length - named.length
  const parts = unnamed ? [...named, unnamed === 1 ? 'a parent' : `${unnamed} parents`] : named
  if (parts.length > 3) return `${named.slice(0, 2).join(', ')} and ${sorted.length - 2} others` // 4+ parts means 3+ names, so two are shown
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? ''
}
