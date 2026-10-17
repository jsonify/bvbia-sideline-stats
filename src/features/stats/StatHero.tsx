import type { ReactNode } from 'react'
import { fmtPct } from '../../lib/export'
import { goalStatus } from '../../lib/goals'
import { CountUp, useGrown } from '../../ui/CountUp'

const STAGGER = { d: 0, f: 0.08, b: 0.16 } // seconds: the three gauges fill one after another

/** A half-circle, left to right over the top. pathLength=100 lets the fill be sized as a plain percentage. */
const ARC = 'M 8 50 A 42 42 0 0 1 92 50'

/** A short line across the arc at `pct` percent of the way round: the team's target. */
function goalTick(pct: number) {
  const a = Math.PI * (1 - pct / 100)
  const at = (r: number) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 - r * Math.sin(a)).toFixed(2)}`
  return `M ${at(35)} L ${at(49)}`
}

export function StatHero({ cls, label, pct, n, d, unit, info, goal }: {
  cls: 'd' | 'f' | 'b'; label: string; pct: number | null; n: number; d: number; unit: string; info?: ReactNode
  /** The team's target for this stat, if the coach set one (whole %). */
  goal?: number
}) {
  const grown = useGrown(pct ?? 0, STAGGER[cls] * 1000)
  const status = goalStatus(pct, goal)
  return (
    <div className={`gauge ${cls}`} role="group" aria-label={label}>
      <div className="dial">
        <svg viewBox="0 0 100 54" aria-hidden="true" focusable="false">
          <path className="track" d={ARC} pathLength={100} />
          {grown > 0 && <path className="fill" d={ARC} pathLength={100} style={{ strokeDasharray: `${grown} 100` }} />}
          {goal !== undefined && <path className="goal" d={goalTick(goal)} />}
        </svg>
        <div className="big"><CountUp value={pct} format={fmtPct} delay={STAGGER[cls]} /></div>
      </div>
      <div className="label-row"><div className="label">{label}</div>{info}</div>
      <div className="of">{d === 0 ? `No ${unit} recorded` : `${n} of ${d} ${unit}`}</div>
      {goal !== undefined && (
        <div className={`goal-txt${status?.met ? ' met' : ''}`}>{status ? <>{status.met && <span aria-hidden="true">✓ </span>}{status.text}</> : `Target ${goal}%`}</div>
      )}
    </div>
  )
}
