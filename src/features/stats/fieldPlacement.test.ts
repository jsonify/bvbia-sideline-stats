import { describe, expect, it } from 'vitest'
import type { StatEvent } from '../../types'
import { BOX_H, BOX_W, END_OF, PITCH_H, PITCH_W, placeEvents } from './fieldPlacement'

let n = 0
const ev = (category: string, outcome: string, extra: object = {}) =>
  ({ id: `evt-${n}`, gameId: 'g', category, outcome, period: 1, createdAt: `2026-01-01T00:00:${String(n++).padStart(2, '0')}Z`, ...extra }) as StatEvent
const spots = (events: StatEvent[]) => placeEvents(events).map((p) => [p.event.id, p.x, p.y])

describe('placeEvents', () => {
  const game = [
    ...Array.from({ length: 10 }, () => ev('duel', 'won')),
    ...Array.from({ length: 6 }, () => ev('first_contact', 'clean', { ballType: 'long_ball' })),
    ...Array.from({ length: 5 }, () => ev('box_entry', 'shot')),
  ]

  it('puts 1v1s and first contact in our half', () => {
    const ours = placeEvents(game).filter((p) => END_OF[p.event.category] === 'defending')
    expect(ours).toHaveLength(16)
    for (const { x, y } of ours) {
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(PITCH_W / 2)
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(PITCH_H)
    }
  })

  it('always puts box entries inside the attacking box, shot or not', () => {
    const entries = placeEvents(Array.from({ length: 30 }, (_, i) => ev('box_entry', i % 2 ? 'shot' : 'no_shot')))
    expect(entries).toHaveLength(30)
    for (const { x, y } of entries) {
      expect(x).toBeGreaterThan(PITCH_W - BOX_W); expect(x).toBeLessThan(PITCH_W)
      expect(y).toBeGreaterThan((PITCH_H - BOX_H) / 2); expect(y).toBeLessThan((PITCH_H + BOX_H) / 2)
    }
  })

  it('gives the same picture every time, whatever order the events arrive in', () => {
    expect(spots(game.slice().reverse())).toEqual(spots(game))
    expect(spots(game)).toEqual(spots(game))
  })

  it('does not move earlier dots when an event is added or undone', () => {
    const before = new Map(placeEvents(game.slice(0, 12)).map((p) => [p.event.id, [p.x, p.y]]))
    const more = placeEvents([...game, ev('duel', 'lost')])
    for (const p of more) if (before.has(p.event.id)) expect([p.x, p.y]).toEqual(before.get(p.event.id))

    const undone = placeEvents(game.map((e, i) => (i === 3 ? { ...e, deletedAt: '2026-01-01T01:00:00Z' } : e)))
    expect(undone).toHaveLength(game.length - 1)
    const all = new Map(placeEvents(game).map((p) => [p.event.id, [p.x, p.y]]))
    for (const p of undone) expect([p.x, p.y]).toEqual(all.get(p.event.id))
  })

  it('spreads a busy game out so dots stay readable', () => {
    const busy = Array.from({ length: 40 }, (_, i) => ev(i % 2 ? 'duel' : 'first_contact', 'won', { ballType: 'through_ball' }))
    const dots = placeEvents(busy)
    let closest = Infinity
    for (const a of dots) for (const b of dots) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y))
    expect(closest).toBeGreaterThan(3)
  })

  it('keeps a typical number of box entries from piling up inside the small box', () => {
    const dots = placeEvents(Array.from({ length: 12 }, () => ev('box_entry', 'shot')))
    let closest = Infinity
    for (const a of dots) for (const b of dots) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y))
    expect(closest).toBeGreaterThan(4.8)
  })
})
