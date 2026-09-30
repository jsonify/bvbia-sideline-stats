import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> { padded?: boolean; children?: ReactNode }

export function Card({ padded, className = '', ...rest }: CardProps) {
  return <div className={['card', padded && 'card-pad-lg', className].filter(Boolean).join(' ')} {...rest} />
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className={['stat-tile-value', tone && `t-${tone}`].filter(Boolean).join(' ')}>{value}</span>
      {sub != null && <span className="stat-tile-sub">{sub}</span>}
    </div>
  )
}
