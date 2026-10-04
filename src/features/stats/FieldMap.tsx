import { useMemo } from 'react'
import type { StatCategory, StatEvent } from '../../types'
import { categoryLabel, outcomeLabel } from '../../lib/export'
import { CLS, POSITIVE } from './insights'
import { END_OF, PITCH_H, PITCH_W, placeEvents } from './fieldPlacement'

// Standard 105 x 68 m pitch, drawn in metres. Our goal is on the left, we attack to the right.
const MID = PITCH_W / 2, CY = PITCH_H / 2
const BOX_W = 16.5, BOX_H = 40.32, SIX_W = 5.5, SIX_H = 18.32, GOAL_H = 7.32, SPOT = 11, ARC_R = 9.15
const ARC_DY = Math.sqrt(ARC_R ** 2 - (BOX_W - SPOT) ** 2) // where the penalty arc meets the edge of the box

const KEYS: { category: StatCategory; label: string }[] = [
  { category: 'duel', label: '1v1' },
  { category: 'first_contact', label: 'First contact' },
  { category: 'box_entry', label: 'Box entry' },
]

function Pitch() {
  const boxY = CY - BOX_H / 2, sixY = CY - SIX_H / 2, goalY = CY - GOAL_H / 2
  return (
    <>
      <rect className="pitch" x={0} y={0} width={PITCH_W} height={PITCH_H} />
      <g className="pitch-lines">
        <rect x={0} y={0} width={PITCH_W} height={PITCH_H} />
        <line x1={MID} y1={0} x2={MID} y2={PITCH_H} />
        <circle cx={MID} cy={CY} r={ARC_R} />
        <rect x={0} y={boxY} width={BOX_W} height={BOX_H} />
        <rect x={PITCH_W - BOX_W} y={boxY} width={BOX_W} height={BOX_H} />
        <rect x={0} y={sixY} width={SIX_W} height={SIX_H} />
        <rect x={PITCH_W - SIX_W} y={sixY} width={SIX_W} height={SIX_H} />
        <path d={`M${BOX_W} ${CY - ARC_DY} A${ARC_R} ${ARC_R} 0 0 1 ${BOX_W} ${CY + ARC_DY}`} />
        <path d={`M${PITCH_W - BOX_W} ${CY + ARC_DY} A${ARC_R} ${ARC_R} 0 0 1 ${PITCH_W - BOX_W} ${CY - ARC_DY}`} />
        <rect x={-2} y={goalY} width={2} height={GOAL_H} />
        <rect x={PITCH_W} y={goalY} width={2} height={GOAL_H} />
        <path d={`M0 1 A1 1 0 0 0 1 0 M${PITCH_W - 1} 0 A1 1 0 0 0 ${PITCH_W} 1 M${PITCH_W} ${PITCH_H - 1} A1 1 0 0 0 ${PITCH_W - 1} ${PITCH_H} M1 ${PITCH_H} A1 1 0 0 0 0 ${PITCH_H - 1}`} />
        <circle className="spot" cx={MID} cy={CY} r={0.6} />
        <circle className="spot" cx={SPOT} cy={CY} r={0.6} />
        <circle className="spot" cx={PITCH_W - SPOT} cy={CY} r={0.6} />
      </g>
    </>
  )
}

/** One dot, drawn around (0,0): circle = 1v1, diamond = first contact, square = box entry. Filled = good outcome. */
function Shape({ category, good }: { category: StatCategory; good: boolean }) {
  const cls = `mk ${CLS[category]}${good ? ' pos' : ''}`
  if (category === 'duel') return <circle className={cls} r={2.8} />
  if (category === 'first_contact') return <rect className={cls} x={-2.45} y={-2.45} width={4.9} height={4.9} transform="rotate(45)" />
  return <rect className={cls} x={-2.4} y={-2.4} width={4.8} height={4.8} rx={0.6} />
}

/**
 * A line drawing of the field with every event of the game on it. Positions are simulated: 1v1s and first contact
 * land at random in our half, box entries in the attacking third, so the picture shows the shape of the game.
 */
export function FieldMap({ events }: { events: StatEvent[] }) {
  const placed = useMemo(() => placeEvents(events), [events])
  const count = (end: 'defending' | 'attacking') => placed.filter((p) => END_OF[p.event.category] === end).length
  const of = (c: StatCategory) => placed.filter((p) => p.event.category === c).length
  const label = `Game map, simulated positions. Defending end: ${of('duel')} 1v1s, ${of('first_contact')} first contacts. Attacking end: ${of('box_entry')} box entries.`

  return (
    <>
      <div className="field-box">
        <div className="field-ends" aria-hidden="true">
          <span>Defending end · {count('defending')}</span>
          <span>Attacking end → · {count('attacking')}</span>
        </div>
        <svg className="field" viewBox={`-3 -3 ${PITCH_W + 6} ${PITCH_H + 6}`} role="img" aria-label={label}>
          <Pitch />
          {placed.map(({ event: e, x, y }) => (
            <g key={e.id} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
              <title>{categoryLabel(e.category)}: {outcomeLabel(e.outcome)} (period {e.period})</title>
              <Shape category={e.category} good={POSITIVE.has(e.outcome)} />
            </g>
          ))}
        </svg>
      </div>
      <div className="legend" aria-hidden="true">
        {KEYS.map(({ category, label }) => (
          <span key={category} className={`key ${CLS[category]}`}>
            <svg width={14} height={14} viewBox="-4 -4 8 8"><Shape category={category} good /></svg>{label}
          </span>
        ))}
        <span>Filled = good outcome, outline = not</span>
      </div>
      <p className="sub">We record what happened, not where, so each dot is placed at random on the right side of the field. It shows the shape of the game, not exact spots.</p>
    </>
  )
}
