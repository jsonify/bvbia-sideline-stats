import { useState } from 'react'
import type { Game, StatEvent, TeamGoals } from '../../types'
import { summarize } from '../../lib/summary'
import { Sheet } from '../../ui'
import { periodBreakdown, periodLabel, takeaways } from './insights'
import { PeriodTable } from './PeriodTable'
import { StatHero } from './StatHero'
import './stats.css'

/** The period to talk about at a break: the latest one anything was recorded in. */
export function focusPeriod(events: StatEvent[]): number {
  return Math.max(1, ...events.filter((e) => !e.deletedAt).map((e) => e.period))
}

/**
 * "Halftime numbers" for the tracker: the latest period's three stats and takeaways, and every period side by side,
 * on one screen the coach can glance at during the break. It is a sheet over the tracker, never a page of its own,
 * because leaving the tracker hands this phone's lanes back.
 */
export function HalftimeSheet({ game, events, goals = {} }: { game: Pick<Game, 'periods'>; events: StatEvent[]; goals?: TeamGoals }) {
  const [open, setOpen] = useState(false)
  const live = events.filter((e) => !e.deletedAt)
  const label = game.periods > 2 ? 'Break numbers' : 'Halftime numbers'
  if (live.length === 0) return null
  const focus = focusPeriod(live)
  const name = periodLabel(focus, game.periods)
  const s = summarize(live.filter((e) => e.period === focus))
  const periods = periodBreakdown(live, game.periods).filter((p) => p <= focus)

  return (
    <>
      <button type="button" className="tk-halftime" onClick={() => setOpen(true)}>
        <span aria-hidden="true">▤</span> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} className="halftime-sheet">
        {(close) => (
          <div className="stats share-body">
            <h3 className="ht-h">{name}</h3>
            <section className="hero" aria-label={`${name} stats`}>
              <StatHero cls="d" label="1v1s won" pct={s.duels.winPct} n={s.duels.won} d={s.duels.total} unit="1v1s" goal={goals.duel} />
              <StatHero cls="f" label="Clean first contact" pct={s.firstContact.cleanPct} n={s.firstContact.clean} d={s.firstContact.total} unit="balls" goal={goals.first_contact} />
              <StatHero cls="b" label="Entries with a shot" pct={s.boxEntries.shotPct} n={s.boxEntries.shot} d={s.boxEntries.total} unit="entries" goal={goals.box_entry} />
            </section>
            <ul className="take" aria-label={`Takeaways from the ${name}`}>{takeaways(s).map((t) => <li key={t}>{t}</li>)}</ul>
            {periods.length > 1 && (
              <PeriodTable events={live} periods={periods} count={game.periods} goals={goals} total="Game so far" caption="Every period so far" />
            )}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={close}>Back to tracking</button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
