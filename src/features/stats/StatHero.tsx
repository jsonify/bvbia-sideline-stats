import type { ReactNode } from 'react'
import { fmtPct } from '../../lib/export'
import { CountUp, useGrown } from '../../ui/CountUp'

const STAGGER = { d: 0, f: 0.08, b: 0.16 } // seconds: the three cards count up one after another

export function StatHero({ cls, label, pct, n, d, unit, info }: { cls: 'd' | 'f' | 'b'; label: string; pct: number | null; n: number; d: number; unit: string; info?: ReactNode }) {
  const grown = useGrown(pct ?? 0, STAGGER[cls] * 1000)
  return (
    <div className={`card ${cls}`} role="group" aria-label={label}>
      <div className="label-row"><div className="label">{label}</div>{info}</div>
      <div className="big"><CountUp value={pct} format={fmtPct} delay={STAGGER[cls]} /></div>
      <div className="of">{d === 0 ? `No ${unit} recorded` : `${n} of ${d} ${unit}`}</div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${grown}%` }} /></div>
    </div>
  )
}
