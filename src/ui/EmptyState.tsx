import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function EmptyState({ icon = 'ball', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={36} /></div>
      <div className="empty-title">{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
