import type { ReactNode } from 'react'

export interface StatButton {
  label: string
  icon: string
  tone: 'good' | 'bad'
  onTap: () => void
  aria: string
}

interface Props {
  id: string
  title: string
  hint: string
  tally: string
  periodTally: string
  period: number
  pct: number | null
  buttons: [StatButton, StatButton]
  disabled?: boolean
  extra?: ReactNode
}

export function StatCard({ id, title, hint, tally, periodTally, period, pct, buttons, disabled, extra }: Props) {
  return (
    <section className="tk-card" aria-labelledby={`${id}-h`}>
      <header className="tk-card-head">
        <div>
          <h2 id={`${id}-h`}>{title}</h2>
          <p className="tk-hint">{hint}</p>
        </div>
        <div className="tk-tally" role="status" aria-live="polite" aria-atomic="true" data-testid={`${id}-tally`}>
          <strong>{tally}</strong>
          <span className="tk-sub">P{period}: {periodTally}</span>
        </div>
      </header>
      <div className="tk-bar" aria-hidden="true"><i style={{ width: `${pct ?? 0}%` }} /></div>
      {extra}
      <div className="tk-btns">
        {buttons.map((b) => (
          <button key={b.label} type="button" className={`tk-btn ${b.tone}`} disabled={disabled} aria-label={b.aria}
            onClick={(ev) => {
              b.onTap()
              const el = ev.currentTarget
              el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop')
            }}>
            <span className="tk-ico" aria-hidden="true">{b.icon}</span>
            <span>{b.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
