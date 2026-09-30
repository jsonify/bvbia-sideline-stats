import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRepo } from '../../data/context'
import type { Game } from '../../types'
import '../shell/shell.css'
import './games.css'

export function todayISO(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface GameDraft { opponent: string; date: string; home: boolean; location: string; notes: string }
export function validateDraft(d: GameDraft): Partial<Record<'opponent' | 'date', string>> {
  const e: Partial<Record<'opponent' | 'date', string>> = {}
  if (!d.opponent.trim()) e.opponent = 'Who are we playing? Enter the opponent.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) e.date = 'Pick a valid date.'
  return e
}

function Seg<T extends string | number>({ name, legend, value, options, onChange }: {
  name: string; legend: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <fieldset className="ss-field" style={{ border: 0, padding: 0, margin: '0 0 16px', position: 'relative' }}>
      <legend className="ss-label">{legend}</legend>
      <div className="ss-seg">
        {options.map((o) => (
          <label key={String(o.v)}>
            <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} />{o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function GameFormPage() {
  const { id } = useParams()
  const repo = useRepo()
  const nav = useNavigate()
  const [existing, setExisting] = useState<Game | null>(null)
  const [d, setD] = useState<GameDraft>({ opponent: '', date: todayISO(), home: true, location: '', notes: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  useEffect(() => {
    if (!id) return
    repo.getGame(id).then((g) => {
      if (!g) return
      setExisting(g)
      setD({ opponent: g.opponent, date: g.date, home: g.home, location: g.location ?? '', notes: g.notes ?? '' })
    })
  }, [id, repo])

  const set = <K extends keyof GameDraft>(k: K, v: GameDraft[K]) => setD((p) => ({ ...p, [k]: v }))

  async function save(startTracking: boolean) {
    const errs = validateDraft(d)
    setErrors(errs)
    if (Object.keys(errs).length) { document.getElementById(errs.opponent ? 'gf-opp' : 'gf-date')?.focus(); return }
    setBusy(true); setFailure('')
    try {
      const g = await repo.saveGame({
        id: existing?.id, opponent: d.opponent.trim(), date: d.date, home: d.home, periods: 2, // soccer: always two halves
        location: d.location.trim() || undefined, notes: d.notes.trim() || undefined,
        status: startTracking && existing?.status !== 'final' ? 'live' : existing?.status ?? 'scheduled',
      })
      nav(startTracking ? `/games/${g.id}/track` : '/', { replace: true })
    } catch (e) {
      setFailure((e as Error).message || 'Could not save. Try again.')
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void save(false) }

  return (
    <main className="ss-page">
      <Link to="/" className="gm-back">‹ Games</Link>
      <h1 className="ss-h1">{id ? 'Edit game' : 'New game'}</h1>
      <form onSubmit={onSubmit} noValidate>
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-opp">Opponent</label>
          <input id="gf-opp" className="ss-input" value={d.opponent} onChange={(e) => set('opponent', e.target.value)}
            placeholder="e.g. Rapids U10" autoComplete="off" autoCapitalize="words" enterKeyHint="next"
            aria-invalid={!!errors.opponent} aria-describedby={errors.opponent ? 'gf-opp-err' : undefined} />
          {errors.opponent && <div id="gf-opp-err" className="ss-error" role="alert">{errors.opponent}</div>}
        </div>
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-date">Date</label>
          <input id="gf-date" type="date" className="ss-input" value={d.date} onChange={(e) => set('date', e.target.value)}
            aria-invalid={!!errors.date} aria-describedby={errors.date ? 'gf-date-err' : undefined} />
          {errors.date && <div id="gf-date-err" className="ss-error" role="alert">{errors.date}</div>}
        </div>
        <Seg name="ha" legend="Home or away" value={d.home ? 'home' : 'away'} onChange={(v) => set('home', v === 'home')}
          options={[{ v: 'home', label: 'Home' }, { v: 'away', label: 'Away' }]} />
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-loc">Location <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <input id="gf-loc" className="ss-input" value={d.location} onChange={(e) => set('location', e.target.value)} placeholder="Field name or address" autoComplete="off" enterKeyHint="next" />
        </div>
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-notes">Notes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <textarea id="gf-notes" className="ss-input" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        {failure && <div className="ss-error" role="alert">{failure}</div>}
        <div className="gm-actions">
          <button type="button" className="ss-btn ss-btn-primary ss-btn-big" disabled={busy} onClick={() => save(true)}>Save &amp; start tracking</button>
          <button type="submit" className="ss-btn" disabled={busy}>Save</button>
        </div>
      </form>
    </main>
  )
}
