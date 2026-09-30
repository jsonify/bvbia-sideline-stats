import type { ReactNode } from 'react'

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
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
