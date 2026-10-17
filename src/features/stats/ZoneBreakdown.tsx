import { useState, type CSSProperties } from 'react'
import type { StatCategory, StatEvent } from '../../types'
import { CHANNELS, channelOf, depthOf, type Channel } from '../../lib/zones'
import { fmtPct } from '../../lib/export'
import { Segmented } from '../../ui'
import { CLS, POSITIVE } from './insights'
import { tallyBy, zonedEvents, zoneNotes, type Tally } from './zoneStats'

const STATS: { category: StatCategory; label: string; good: string }[] = [
  { category: 'duel', label: '1v1s', good: 'won' },
  { category: 'first_contact', label: 'First contact', good: 'clean' },
  { category: 'box_entry', label: 'Box entries', good: 'with a shot' },
]
const SIDE: Record<Channel, string> = { l: 'Left', c: 'Centre', r: 'Right' }
/** Columns in the order the game map draws them: our goal on the left, theirs on the right. */
const DEPTHS = {
  defending: [['def', 'Deep in our half'], ['mid', 'Near halfway']],
  attacking: [['edge', 'Edge of the box'], ['near', 'Close to goal']],
} as const

const NONE: Tally = { n: 0, d: 0 }

/**
 * "Where it happened": for one stat at a time, how many taps landed in each zone and how many of those went our way,
 * laid out like the field (left side on top, as we attack), with side and depth totals. Below it, the zone notes.
 * Only shown when at least one tap of the game was made on the field.
 */
export function ZoneBreakdown({ events }: { events: StatEvent[] }) {
  const have = STATS.filter((s) => zonedEvents(events, s.category).length > 0)
  const [picked, setPicked] = useState<StatCategory | null>(null)
  if (have.length === 0) return null
  const stat = have.find((s) => s.category === picked) ?? have[0]
  const zoned = zonedEvents(events, stat.category)
  const skipped = events.filter((e) => !e.deletedAt && e.category === stat.category).length - zoned.length
  const byZone = tallyBy(zoned, (z) => z), bySide = tallyBy(zoned, channelOf), byDepth = tallyBy(zoned, depthOf)
  const most = Math.max(...[...byZone.values()].map((t) => t.d))
  const depths = DEPTHS[stat.category === 'box_entry' ? 'attacking' : 'defending']
  const notes = zoneNotes(events)

  const cell = (key: string, t: Tally, shade = false) => {
    const style = shade && t.d ? { '--heat': `${Math.round((t.d / most) * 32)}%` } as CSSProperties : undefined
    return (
      <td key={key} className={shade && t.d ? 'heat' : undefined} style={style}
        aria-label={t.d ? `${t.n} of ${t.d} ${stat.good}` : 'none'}>
        {t.d ? <>{t.n}/{t.d} <small>{fmtPct((t.n / t.d) * 100)}</small></> : '—'}
      </td>
    )
  }

  return (
    <>
      {have.length > 1 && (
        <Segmented className="field-period" label="Show zones for" value={stat.category} onChange={setPicked}
          options={have.map((s) => ({ value: s.category, label: s.label }))} />
      )}
      <div className={`scroll zones ${CLS[stat.category]}`}>
        <table aria-label={`${stat.label} by zone: ${stat.good} out of taps in each zone`}>
          <thead><tr>
            <th scope="col"><span className="vh">Side</span></th>
            {depths.map(([k, label]) => <th key={k} scope="col">{label}</th>)}
            <th scope="col">Side total</th>
          </tr></thead>
          <tbody>
            {CHANNELS.map((c) => (
              <tr key={c}>
                <th scope="row">{SIDE[c]}</th>
                {depths.map(([k]) => cell(k, byZone.get(`${k}_${c}`) ?? NONE, true))}
                {cell('side', bySide.get(c) ?? NONE)}
              </tr>
            ))}
            <tr className="total">
              <th scope="row">Total</th>
              {depths.map(([k]) => cell(k, byDepth.get(k) ?? NONE))}
              {cell('all', { n: zoned.filter((e) => POSITIVE.has(e.outcome)).length, d: zoned.length })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sub">
        {stat.label} {stat.good} out of the taps made in each zone; darker = more of the action. Left and right are as we
        attack{stat.category === 'box_entry' ? ', in their box' : ', in our half'}.
        {skipped > 0 && ` ${skipped} ${skipped === 1 ? 'tap' : 'taps'} made with the buttons ${skipped === 1 ? "doesn't" : "don't"} say where, so ${skipped === 1 ? "it isn't" : "they aren't"} counted here.`}
      </p>
      {notes.length > 0 && <ul className="take zone-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </>
  )
}
