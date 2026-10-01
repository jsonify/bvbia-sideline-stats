// Who tracks what. A game has two lanes and each lane has its own tracker, so two phones can work the same game
// at once without ever tapping the same play. One phone can hold both lanes (the original "track everything").
import type { StatCategory } from '../types'

export type Lane = 'defense' | 'offense'
export const LANES: readonly Lane[] = ['defense', 'offense']

/** The one place that says which lane a stat belongs to. Change a line here to move a stat to the other phone. */
export const LANE_OF: Record<StatCategory, Lane> = {
  duel: 'defense',
  first_contact: 'defense',
  box_entry: 'offense',
}

/** What a phone chooses to track: both lanes, or just one. */
export type Role = 'all' | Lane
export const ROLES: readonly Role[] = ['all', 'defense', 'offense']
export const ROLE_LANES: Record<Role, Lane[]> = { all: [...LANES], defense: ['defense'], offense: ['offense'] }

export const ROLE_LABEL: Record<Role, string> = { all: 'Everything', defense: 'Defense', offense: 'Offense' }
export const ROLE_BLURB: Record<Role, string> = { all: 'All three', defense: '1v1s, contact', offense: 'Box entries' }

/** The role a set of lanes adds up to, or null when it is empty (watching). */
export function roleOf(lanes: readonly Lane[]): Role | null {
  const d = lanes.includes('defense'), o = lanes.includes('offense')
  return d && o ? 'all' : d ? 'defense' : o ? 'offense' : null
}

/** "everything" / "defense" / "offense", for sentences like "Sam is tracking defense". */
export function lanesText(lanes: readonly Lane[]): string {
  const r = roleOf(lanes)
  return r === 'all' ? 'everything' : r ?? 'nothing'
}
