import { useState } from 'react'
import { useRepo } from '../../data/context'
import type { StatCategory, Team, TeamGoals } from '../../types'
import { cleanGoals, GOAL_CATEGORIES } from '../../lib/goals'

const LABEL: Record<StatCategory, string> = {
  duel: 'Defensive 1v1s won',
  first_contact: 'Clean first contact',
  box_entry: 'Box entries with a shot',
}

const toText = (g: TeamGoals | undefined) =>
  Object.fromEntries(GOAL_CATEGORIES.map((c) => [c, g?.[c] !== undefined ? String(g[c]) : ''])) as Record<StatCategory, string>

/**
 * The coach's target for each stat ("win 60% of 1v1s"), shared by the whole team. The gauges, tracker bars and season
 * charts mark it, so everyone knows which number the team is working on this week. Leave a box empty for no target.
 */
export function TeamTargets({ team }: { team: Team }) {
  const repo = useRepo()
  const saved = toText(team.goals)
  const [value, setValue] = useState(saved)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const key = JSON.stringify(saved)
  const [seen, setSeen] = useState(key)
  if (seen !== key) { setSeen(key); setValue(saved) } // another phone changed them

  const parsed = cleanGoals(Object.fromEntries(GOAL_CATEGORIES.map((c) => [c, value[c].trim() === '' ? undefined : Number(value[c])])))
  const invalid = GOAL_CATEGORIES.filter((c) => value[c].trim() !== '' && parsed[c] === undefined)
  const dirty = JSON.stringify(toText(parsed)) !== key || invalid.length > 0

  return (
    <form className="ss-card" style={{ marginTop: 16 }} aria-labelledby="targets-h" onSubmit={async (e) => {
      e.preventDefault()
      if (invalid.length) return
      setBusy(true)
      try {
        await repo.saveGoals(parsed)
        setMsg('Saved for the whole team')
      } catch (err) {
        setMsg((err as Error)?.message || "Couldn't save. Check your connection and try again.")
      } finally { setBusy(false) }
      setTimeout(() => setMsg(''), 3500)
    }}>
      <div className="ss-label" id="targets-h">Team targets</div>
      <div className="ss-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        What the coach wants the team to hit, as a percentage. Every gauge and chart marks it. Leave a box empty for no target.
      </div>
      {GOAL_CATEGORIES.map((c) => (
        <div key={c} className="st-target">
          <label htmlFor={`target-${c}`}>{LABEL[c]}</label>
          <span className="st-target-in">
            <input id={`target-${c}`} className="ss-input" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="—"
              enterKeyHint="done" value={value[c]} aria-invalid={invalid.includes(c) || undefined}
              onChange={(e) => setValue({ ...value, [c]: e.target.value.replace(/[^0-9]/g, '') })} />
            <span aria-hidden="true">%</span>
          </span>
        </div>
      ))}
      {invalid.length > 0 && <div className="ss-hint" role="alert">Use a number from 1 to 100.</div>}
      <div className="ss-row" style={{ marginTop: 8, alignItems: 'center' }}>
        <button className="ss-btn ss-btn-primary" disabled={!dirty || busy || invalid.length > 0}>{busy ? 'Saving…' : 'Save targets'}</button>
        <span role="status" aria-live="polite" className="ss-hint" style={{ margin: 0 }}>{msg}</span>
      </div>
    </form>
  )
}
