import type { StatCategory, StatEvent } from '../../types'
import { channelOf, depthOf, isZone, zoneFits, type Channel, type Zone } from '../../lib/zones'
import { POSITIVE, SMALL } from './insights'

// What the zones of a game add up to. The game map shows every dot; this answers what a coach asks after: where did
// we lose our 1v1s, where did first contact go wrong, which way did our box entries come and which ones got a shot.
// Only taps made on the field count here: a tap made with the buttons says what happened but not where.

/** `n` good outcomes out of `d` taps. */
export interface Tally { n: number; d: number }

/** The live taps of one stat that say (sensibly) where they happened. */
export const zonedEvents = (events: StatEvent[], category: StatCategory) =>
  events.filter((e) => !e.deletedAt && e.category === category && isZone(e.zone) && zoneFits(category, e.zone))

/** Tallies of `events` (already one stat, all zoned) grouped by `key` of their zone. */
export function tallyBy<K>(events: StatEvent[], key: (z: Zone) => K): Map<K, Tally> {
  const out = new Map<K, Tally>()
  for (const e of events) {
    const k = key(e.zone as Zone), t = out.get(k) ?? { n: 0, d: 0 }
    t.d++
    if (POSITIVE.has(e.outcome)) t.n++
    out.set(k, t)
  }
  return out
}

const SIDE: Record<Channel, string> = { l: 'on the left', c: 'through the centre', r: 'on the right' }
const DEPTH = { def: 'deep in our half', mid: 'near halfway', edge: 'at the edge of the box', near: 'close to goal' } as const

interface Area { where: string; bad: number; t: Tally }

/** "3 of our 4" / "All 3". */
const ofOur = (k: number, all: number) => (k === all ? `All ${all}` : `${k} of our ${all}`)

/**
 * Where most of a stat's bad outcomes happened, if they bunch up: one zone, else one side, else one depth. Needs at
 * least three bad outcomes, and the area must hold most of them (a clear majority for a depth, which has only two).
 */
function hotspot(events: StatEvent[]): Area | null {
  const bad = events.filter((e) => !POSITIVE.has(e.outcome)).length
  if (bad < 3) return null
  const groups: [(z: Zone) => string, (k: string) => string, number][] = [
    [(z) => z, (k) => `${SIDE[channelOf(k as Zone)]}, ${DEPTH[depthOf(k as Zone)]}`, 0.6],
    [channelOf, (k) => SIDE[k as Channel], 0.6],
    [depthOf, (k) => DEPTH[k as keyof typeof DEPTH], 0.75],
  ]
  for (const [key, where, share] of groups) {
    let best: Area | null = null
    for (const [k, t] of tallyBy(events, key)) {
      const b = t.d - t.n
      if (b >= 3 && b / bad >= share && (!best || b > best.bad)) best = { where: where(k), bad: b, t }
    }
    if (best) return best
  }
  return null
}

/** Plain-English notes about where things happened (one per stat at most). Careful with tiny samples, like `takeaways`. */
export function zoneNotes(events: StatEvent[]): string[] {
  const out: string[] = []

  const duels = zonedEvents(events, 'duel')
  const d = duels.length >= SMALL ? hotspot(duels) : null
  if (d) {
    const lost = duels.filter((e) => e.outcome === 'lost').length
    out.push(`${ofOur(d.bad, lost)} lost 1v1s came ${d.where} (we won ${d.t.n} of ${d.t.d} there), so that is the area to cover.`)
  }

  const contact = zonedEvents(events, 'first_contact')
  const f = contact.length >= SMALL ? hotspot(contact) : null
  if (f) {
    const missed = contact.filter((e) => e.outcome === 'miss').length
    out.push(`${ofOur(f.bad, missed)} missed first contacts came ${f.where} (${f.t.n} of ${f.t.d} clean there).`)
  }

  const box = zonedEvents(events, 'box_entry')
  if (box.length >= SMALL) {
    const by = tallyBy(box, (z) => (channelOf(z) === 'c' ? 'centre' : 'wide'))
    const c = by.get('centre') ?? { n: 0, d: 0 }, w = by.get('wide') ?? { n: 0, d: 0 }
    const pc = c.d ? c.n / c.d : 0, pw = w.d ? w.n / w.d : 0
    if (c.d >= 2 && w.d >= 2 && Math.abs(pc - pw) >= 0.25) {
      out.push(pc > pw
        ? `Box entries through the centre ended in a shot more often (${c.n} of ${c.d}) than from the wings (${w.n} of ${w.d}).`
        : `Box entries from the wings ended in a shot more often (${w.n} of ${w.d}) than through the centre (${c.n} of ${c.d}).`)
    } else {
      const sides = [...tallyBy(box, channelOf)].sort((a, b) => b[1].d - a[1].d)
      const [side, t] = sides[0]
      if (t.d / box.length >= 0.6) out.push(`Most box entries came ${side === 'c' ? SIDE.c : `down the ${side === 'l' ? 'left' : 'right'}`} (${t.d} of ${box.length}, ${t.n} with a shot).`)
    }
  }
  return out
}
