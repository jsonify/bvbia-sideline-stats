// Where on the field a tap happened, as one of twelve big zones: six in our half for the defensive stats, six inside
// the box we attack for box entries. A parent on the sideline can't place a play to the metre, but they can say
// "left side, deep in our half" or "centre of the box, close to goal", and that is what a coach acts on.
//
// Zones are always relative to the goal we attack, never to the screen: left is our left as we attack, so a zone
// means the same thing in either half and the summary map never has to flip anything.
import type { StatCategory } from '../types'

export type Channel = 'l' | 'c' | 'r'
export type DefenseZone = `def_${Channel}` | `mid_${Channel}`
export type BoxZone = `edge_${Channel}` | `near_${Channel}`
export type Zone = DefenseZone | BoxZone

export const CHANNELS: readonly Channel[] = ['l', 'c', 'r']
/** Our half, split down the middle: `def` is the half nearer our goal, `mid` the half nearer halfway. */
export const DEFENSE_ZONES: readonly DefenseZone[] = CHANNELS.flatMap((c) => [`def_${c}`, `mid_${c}`] as const)
/** Their box, split the same way: `edge` is the half by the line of the box, `near` the half by the goal. */
export const BOX_ZONES: readonly BoxZone[] = CHANNELS.flatMap((c) => [`edge_${c}`, `near_${c}`] as const)
export const ZONES: readonly Zone[] = [...DEFENSE_ZONES, ...BOX_ZONES]

export const isZone = (v: unknown): v is Zone => typeof v === 'string' && (ZONES as readonly string[]).includes(v)
export const isBoxZone = (z: Zone): z is BoxZone => z.startsWith('edge_') || z.startsWith('near_')
/** A zone only makes sense with the stats played there: box entries in the box, the rest in our half. */
export const zoneFits = (category: StatCategory, z: Zone) => (category === 'box_entry') === isBoxZone(z)

export const channelOf = (z: Zone) => z.slice(-1) as Channel
/** The near/far part of a zone: `def`/`mid` in our half, `edge`/`near` in the box. */
export const depthOf = (z: Zone) => z.slice(0, -2) as 'def' | 'mid' | 'edge' | 'near'
const CHANNEL_TEXT: Record<Channel, string> = { l: 'left', c: 'centre', r: 'right' }
const DEPTH_TEXT = { def: 'deep in our half', mid: 'near halfway', edge: 'edge of the box', near: 'close to goal' } as const

/** "Left, deep in our half" / "Centre, close to goal". */
export function zoneText(z: Zone): string {
  const c = CHANNEL_TEXT[channelOf(z)]
  return `${c[0].toUpperCase()}${c.slice(1)}, ${DEPTH_TEXT[depthOf(z)]}`
}

/**
 * Which way the field is drawn. Teams change ends at halftime, so from the sideline our goal moves to the other side:
 * in the second half (the last two quarters) the picture turns round. `swapped` is the parent's own correction for
 * when the app guessed wrong, e.g. we kicked off attacking the other way.
 */
export function attacksLeft(period: number, periods: number, swapped: boolean): boolean {
  const secondHalf = period > periods / 2
  return secondHalf !== swapped
}
