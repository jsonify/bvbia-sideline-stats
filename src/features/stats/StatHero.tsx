import type { ReactNode } from 'react'
import { fmtPct } from '../../lib/export'

export function StatHero({ cls, label, pct, n, d, unit, info }: { cls: 'd' | 'f' | 'b'; label: string; pct: number | null; n: number; d: number; unit: string; info?: ReactNode }) {
  return (
    <div className={`card ${cls}`} role="group" aria-label={label}>
      <div className="label-row"><div className="label">{label}</div>{info}</div>
      <div className="big">{fmtPct(pct)}</div>
      <div className="of">{d === 0 ? `No ${unit} recorded` : `${n} of ${d} ${unit}`}</div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${pct ?? 0}%` }} /></div>
    </div>
  )
}
