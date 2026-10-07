import type { ReactElement, ReactNode } from 'react'
import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight'

const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const

/**
 * Gives a row of choices a "pill" that slides to whichever one is selected, like an iOS segmented control.
 * Put it INSIDE the row's own container and wrap each choice in <PillItem value=…>. The pill is drawn behind the choice, so the
 * choice itself should have a transparent background. Style the pill with `pillClassName` (give it `inset:0`, a radius and a fill).
 */
export function PillGroup({ value, pillClassName, children }: { value: string | null; pillClassName: string; children: ReactNode }) {
  return (
    <Highlight controlledItems value={value} click={false} className={pillClassName} transition={SPRING}>
      {children}
    </Highlight>
  )
}

export function PillItem({ value, className, children }: { value: string; className?: string; children: ReactElement }) {
  return <HighlightItem value={value} className={className}>{children}</HighlightItem>
}
