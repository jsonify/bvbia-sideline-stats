import { createContext, useCallback, useContext, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'

export interface ToastOptions { tone?: 'good' | 'bad'; actionLabel?: string; onAction?: () => void; duration?: number }
interface ToastItem extends ToastOptions { id: number; message: string }
type ShowToast = (message: string, opts?: ToastOptions) => void

const Ctx = createContext<ShowToast>(() => {})
const SPRING = { type: 'spring', stiffness: 460, damping: 34 } as const

/** One toast. It springs up from the bottom, and a swipe down (or a flick) sends it away early, like an iOS banner. */
function ToastView({ t, dismiss }: { t: ToastItem; dismiss: () => void }) {
  const y = useMotionValue(0)
  const drag = useRef<{ id: number; y0: number; last: number; lastT: number; v: number; active: boolean } | null>(null)
  const down = (e: ReactPointerEvent) => { drag.current = { id: e.pointerId, y0: e.clientY, last: e.clientY, lastT: e.timeStamp, v: 0, active: false } }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    if (!d.active) {
      if (e.clientY - d.y0 < 6) return // a tap on the button is not a swipe; only claim the pointer once it moves down
      d.active = true; d.y0 = e.clientY; y.stop(); e.currentTarget.setPointerCapture(e.pointerId)
    }
    y.set(Math.max(0, e.clientY - d.y0))
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = ((e.clientY - d.last) / dt) * 1000
    d.last = e.clientY; d.lastT = e.timeStamp
  }
  const up = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || !d.active || e.pointerId !== d.id) return
    if (y.get() > 28 || d.v > 350) dismiss()
    else animate(y, 0, SPRING)
  }
  return (
    <motion.div
      layout
      className={['toast', t.tone && `toast-${t.tone}`].filter(Boolean).join(' ')}
      initial={{ opacity: 0, y: 28, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.96, transition: { duration: 0.16 } }}
      transition={SPRING}
      style={{ y, animation: 'none', touchAction: 'pan-x' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    >
      <span>{t.message}</span>
      {t.onAction && <button type="button" className="toast-action" onClick={() => { t.onAction?.(); dismiss() }}>{t.actionLabel ?? 'Undo'}</button>}
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const show = useCallback<ShowToast>((message, opts = {}) => {
    const id = next.current++
    setItems((l) => [...l.slice(-2), { id, message, ...opts }])
    setTimeout(() => dismiss(id), opts.duration ?? (opts.onAction ? 5000 : 2600))
  }, [dismiss])
  const value = useMemo(() => show, [show])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => <ToastView key={t.id} t={t} dismiss={() => dismiss(t.id)} />)}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

/** Returns show(message, opts). Safe (no-op) outside a provider. */
export function useToast(): ShowToast { return useContext(Ctx) }
