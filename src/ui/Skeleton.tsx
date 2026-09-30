import type { CSSProperties } from 'react'

export function Skeleton({ variant = 'line', width, height, style }: { variant?: 'line' | 'block'; width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <div className={`skeleton skeleton-${variant}`} aria-hidden style={{ width, height, ...style }} />
}

/** A few placeholder cards for list loading states. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: count }, (_, i) => <Skeleton key={i} variant="block" />)}</div>
}
