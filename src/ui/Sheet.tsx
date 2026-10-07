import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'

const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 1 } as const

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  label?: string
  className?: string
  /** Pass a function to get `close`, which slides the sheet away and then calls onClose (use it for your own Close / Done buttons). */
  children?: ReactNode | ((close: () => void) => ReactNode)
}

/**
 * Bottom sheet: <Sheet open onClose title="..">children</Sheet>. It springs up from the bottom; drag the handle down (or flick it),
 * tap outside, or press Escape to slide it away. `onClose` is called once it has finished leaving. Focus moves in while it is
 * open and goes back to whatever opened it, and the page behind does not scroll. It is drawn on the body, outside the page
 * that opened it, so that page's styles and touch handling never reach the sheet.
 * Without a visible `title`, pass `label` so the dialog still has a name.
 */
export function Sheet({ open, onClose, title, label, className = '', children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  const [shown, setShown] = useState(open) // false while sliding away; onClose waits until that has finished
  useEffect(() => setShown(open), [open])
  const dismiss = useCallback(() => setShown(false), [])

  const y = useMotionValue(0)
  const dim = useTransform(y, [0, 400], [1, 0.35]) // the backdrop lightens as the sheet is pulled down
  const drag = useRef<{ id: number; y0: number; last: number; lastT: number; v: number } | null>(null)

  useEffect(() => {
    if (!shown) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [shown, dismiss])

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    y.stop()
    drag.current = { id: e.pointerId, y0: e.clientY, last: e.clientY, lastT: e.timeStamp, v: 0 }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    y.set(Math.max(0, e.clientY - d.y0))
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = ((e.clientY - d.last) / dt) * 1000 // px per second
    d.last = e.clientY; d.lastT = e.timeStamp
  }
  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || e.pointerId !== d.id) return
    const h = ref.current?.offsetHeight ?? 400
    if (y.get() > h / 3 || d.v > 600) dismiss()
    else animate(y, 0, SPRING)
  }

  return createPortal(
    <AnimatePresence onExitComplete={() => { if (open) close.current() }}>
      {shown && (
        <motion.div
          key="sheet"
          className="overlay ss-sheet-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          style={{ animation: 'none' }}
          onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
        >
          <motion.div className="ss-sheet-dim" aria-hidden="true" style={{ opacity: dim }} />
          <motion.div
            ref={ref} tabIndex={-1} className={`sheet ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label ?? title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={SPRING}
            style={{ y, animation: 'none' }}
          >
            <div className="sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <div className="sheet-handle" />
            </div>
            {title && <h2 className="sheet-title">{title}</h2>}
            {typeof children === 'function' ? children(dismiss) : children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
