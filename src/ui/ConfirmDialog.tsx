import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className="t-xl">{title}</h2>
        {message && <div className="t-muted">{message}</div>}
        <div className="sheet-actions">
          <Button onClick={onCancel} autoFocus>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Bottom sheet: <Sheet open onClose title="..">children</Sheet>. Escape or a tap outside closes it, focus moves in
 * while it is open and goes back to whatever opened it, and the page behind does not scroll. It is drawn on the
 * body, outside the page that opened it, so that page's styles and touch handling never reach the sheet.
 * Without a visible `title`, pass `label` so the dialog still has a name.
 */
export function Sheet({ open, onClose, title, label, className = '', children }: {
  open: boolean; onClose: () => void; title?: string; label?: string; className?: string; children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} tabIndex={-1} className={`sheet ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label ?? title}>
        <div className="sheet-handle" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  )
}
