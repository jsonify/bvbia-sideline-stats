import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate } from 'motion/react'

/** Real browsers only, and not when the person asked for less motion. Without matchMedia (the unit tests) the number just shows. */
const canAnimate = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const whole = (n: number | null) => String(Math.round(n ?? 0)) // module-level so its identity is stable

/**
 * A number that counts up to its value when it first appears and glides to the new value when it changes.
 * The text is always the real value as far as the page is concerned: React renders `format(value)`, and the count is
 * drawn straight onto that text, so screen readers and tests see the final number and nothing else.
 */
export function CountUp({ value, format = whole, delay = 0, duration = 0.9 }: {
  value: number | null
  format?: (n: number | null) => string
  delay?: number
  duration?: number
}) {
  const el = useRef<HTMLSpanElement>(null)
  const shown = useRef<number>(0) // what the number last showed, so the next change starts from there

  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    if (value === null || !canAnimate()) {
      node.textContent = format(value)
      shown.current = value ?? 0
      return
    }
    node.textContent = format(shown.current) // before the first paint, so the final number never flashes up first
    const run = animate(shown.current, value, {
      duration, delay, ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { shown.current = v; node.textContent = format(v) },
      onComplete: () => { shown.current = value; node.textContent = format(value) },
    })
    return () => run.stop()
  }, [value, format, delay, duration])

  return <span ref={el}>{format(value)}</span>
}

/** A progress bar's fill that grows from empty when it first appears and slides when its value changes (CSS does the sliding, so reduced motion is honoured). */
export function useGrown(pct: number, delayMs = 0): number {
  const [w, setW] = useState(canAnimate() ? 0 : pct)
  useEffect(() => {
    const t = setTimeout(() => setW(pct), delayMs || 16) // one frame after mounting, so there is something to grow from
    return () => clearTimeout(t)
  }, [pct, delayMs])
  return w
}
