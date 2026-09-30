import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface ToastOptions { tone?: 'good' | 'bad'; actionLabel?: string; onAction?: () => void; duration?: number }
interface ToastItem extends ToastOptions { id: number; message: string }
type ShowToast = (message: string, opts?: ToastOptions) => void

const Ctx = createContext<ShowToast>(() => {})

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
        {items.map((t) => (
          <div key={t.id} className={['toast', t.tone && `toast-${t.tone}`].filter(Boolean).join(' ')}>
            <span>{t.message}</span>
            {t.onAction && <button type="button" className="toast-action" onClick={() => { t.onAction?.(); dismiss(t.id) }}>{t.actionLabel ?? 'Undo'}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

/** Returns show(message, opts). Safe (no-op) outside a provider. */
export function useToast(): ShowToast { return useContext(Ctx) }
