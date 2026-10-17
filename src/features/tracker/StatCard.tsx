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
  /** Left out when the taps are made on the field instead: the card then only shows the numbers. */
  buttons?: [StatButton, StatButton]
  disabled?: boolean
  extra?: ReactNode
  /** The ⓘ that explains this stat, shown beside its name. */
  info?: ReactNode
  /** Why the buttons are off when it is not this phone's stat, e.g. "Sam is tracking this". */
  note?: string
  /** The team's target for this stat (whole %), marked on the bar. */
  goal?: number
}

export function StatCard({ id, title, hint, tally, periodTally, period, pct, buttons, disabled, extra, info, note, goal }: Props) {
  return (
    <section className="tk-card" aria-labelledby={`${id}-h`}>
      <header className="tk-card-head">
        <div>
          <div className="tk-title-row"><h2 id={`${id}-h`}>{title}</h2>{info}</div>
          <p className="tk-hint">{hint}</p>
          {note && <p className="tk-note">{note}</p>}
        </div>
        <div className="tk-tally" role="status" aria-live="polite" aria-atomic="true" data-testid={`${id}-tally`}>
          <strong>{tally}</strong>
          <span className="tk-sub" key={period}>P{period}: {periodTally}</span>
        </div>
      </header>
      <div className="tk-bar" aria-hidden="true">
        <i style={{ width: `${pct ?? 0}%` }} />
        {goal !== undefined && <b className={`tk-goal${pct !== null && pct >= goal - 0.5 ? ' met' : ''}`} style={{ left: `${goal}%` }} />}
      </div>
      {goal !== undefined && <p className="tk-goal-txt">Target {goal}%</p>}
      {extra}
      {buttons && <div className="tk-btns">
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
      </div>}
    </section>
  )
}
