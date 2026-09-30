import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  block?: boolean
  loading?: boolean
  icon?: IconName
  children?: ReactNode
}

export function Button({ variant = 'default', size = 'md', block, loading, icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size === 'lg' && 'btn-lg', block && 'btn-block', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} aria-busy={loading || undefined} disabled={rest.disabled} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === 'lg' ? 26 : 20} /> : null}
      {children}
    </button>
  )
}
