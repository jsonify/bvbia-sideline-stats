import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type Tone = 'default' | 'good' | 'bad' | 'warn' | 'brand' | 'live'
const cls = (tone: Tone, extra = '') => ['chip', tone !== 'default' && `chip-${tone}`, extra].filter(Boolean).join(' ')

export function Chip({ tone = 'default', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; children?: ReactNode }) {
  return <span className={cls(tone, className)} {...rest} />
}

/** Tappable chip (filters etc). */
export function ChipButton({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return <button type="button" className={cls('default', className)} aria-pressed={!!selected} {...rest} />
}
