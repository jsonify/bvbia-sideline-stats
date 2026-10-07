import type { ReactNode } from 'react'
import { PillGroup, PillItem } from './PillGroup'

export interface SegmentedProps<T extends string | number> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label?: string
  className?: string
}

export function Segmented<T extends string | number>({ value, onChange, options, label, className = '' }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
      <PillGroup value={String(value)} pillClassName="seg-pill">
        {options.map((o) => (
          <PillItem key={String(o.value)} value={String(o.value)} className="seg-item">
            <button type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
              {o.label}
            </button>
          </PillItem>
        ))}
      </PillGroup>
    </div>
  )
}
