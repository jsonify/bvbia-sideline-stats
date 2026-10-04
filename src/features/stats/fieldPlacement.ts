import type { StatCategory, StatEvent } from '../../types'

// We record what happened, not where, so the game map invents a position for every event. The invention is
// deterministic (a function of the event id) so the picture is the same on every reload and every phone.

/** Pitch size in metres. x runs from our goal line (0) to theirs, y across the width. */
export const PITCH_W = 105
export const PITCH_H = 68

export type End = 'defending' | 'attacking'

/** Same split as the tracker lanes: 1v1s and first contact happen at our end, box entries at theirs. */
export const END_OF: Record<StatCategory, End> = { duel: 'defending', first_contact: 'defending', box_entry: 'attacking' }

interface Zone { x: [number, number]; y: [number, number] }
const EDGE = 4 // keeps a dot clear of the touchlines
/** Where a dot may land. Box entries stay in the attacking third, around the box, since that is what the stat means. */
const ZONES: Record<End, Zone> = {
  defending: { x: [EDGE, PITCH_W / 2 - EDGE], y: [EDGE, PITCH_H - EDGE] },
  attacking: { x: [PITCH_W * 0.63, PITCH_W - EDGE], y: [EDGE, PITCH_H - EDGE] },
}

/** Random spots tried per event; the one furthest from the dots already there wins, so dots spread out. */
const CANDIDATES = 30

export interface Placed { event: StatEvent; x: number; y: number }

/** FNV-1a: turns an event id into a seed. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** mulberry32: a tiny seeded random number generator returning [0, 1). */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A made-up spot on the pitch for every live event, in time order. Undone events still take their slot (they are
 * just not returned), so undoing a tap never moves the other dots, and a new event never moves the earlier ones.
 */
export function placeEvents(events: StatEvent[]): Placed[] {
  const ordered = events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const taken: Record<End, { x: number; y: number }[]> = { defending: [], attacking: [] }
  const out: Placed[] = []
  for (const event of ordered) {
    const end = END_OF[event.category], zone = ZONES[end], rand = random(hash(event.id))
    let best = { x: 0, y: 0 }, bestGap = -1
    for (let i = 0; i < CANDIDATES; i++) {
      const p = { x: zone.x[0] + rand() * (zone.x[1] - zone.x[0]), y: zone.y[0] + rand() * (zone.y[1] - zone.y[0]) }
      const gap = Math.min(...taken[end].map((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2)) // Infinity while the end is empty
      if (gap > bestGap) { best = p; bestGap = gap }
    }
    taken[end].push(best)
    if (!event.deletedAt) out.push({ event, ...best })
  }
  return out
}
