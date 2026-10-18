import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRepo } from '../../data/context'
import type { Game } from '../../types'
import '../shell/shell.css'
import './games.css'
import { PillGroup, PillItem } from '../../ui/PillGroup'
import { Icon } from '../../ui/Icon'
import { locateField } from './locate'
import { cleanMinutes, MAX_HALF_MINUTES } from '../../lib/clock'

export function todayISO(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** `halves` is the minutes typed for each half, as typed: all empty = not set. */
export interface GameDraft { opponent: string; date: string; home: boolean; location: string; notes: string; halves: string[] }
export function validateDraft(d: GameDraft): Partial<Record<'opponent' | 'date' | 'halves', string>> {
  const e: Partial<Record<'opponent' | 'date' | 'halves', string>> = {}
  if (!d.opponent.trim()) e.opponent = 'Who are we playing? Enter the opponent.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) e.date = 'Pick a valid date.'
  if (d.halves.some((h) => h.trim()) && !draftMinutes(d.halves)) e.halves = `Enter the minutes for each half, from 1 to ${MAX_HALF_MINUTES}.`
  return e
}

/** The typed half lengths as minutes, or null when they aren't all there and valid. */
export const draftMinutes = (halves: string[]) =>
  cleanMinutes(halves.map((h) => (/^\s*\d+\s*$/.test(h) ? Number(h) : NaN)), halves.length)

const NO_HALVES = ['', '']
const halvesOf = (g?: Pick<Game, 'halfMinutes' | 'periods'> | null) => cleanMinutes(g?.halfMinutes, g?.periods)?.map(String) ?? NO_HALVES

function Seg<T extends string | number>({ name, legend, value, options, onChange }: {
  name: string; legend: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <fieldset className="ss-field" style={{ border: 0, padding: 0, margin: '0 0 16px', position: 'relative' }}>
      <legend className="ss-label">{legend}</legend>
      <div className="ss-seg">
        <PillGroup value={String(value)} pillClassName="ss-seg-pill">
          {options.map((o) => (
            <PillItem key={String(o.v)} value={String(o.v)} className="ss-seg-item">
              <label>
                <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} />{o.label}
              </label>
            </PillItem>
          ))}
        </PillGroup>
      </div>
    </fieldset>
  )
}

export default function GameFormPage() {
  const { id } = useParams()
  const repo = useRepo()
  const nav = useNavigate()
  const [existing, setExisting] = useState<Game | null>(null)
  const [d, setD] = useState<GameDraft>({ opponent: '', date: todayISO(), home: true, location: '', notes: '', halves: NO_HALVES })
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  useEffect(() => {
    if (!id) {
      // A new game starts with the half lengths of the team's latest game: they rarely change from week to week.
      repo.listGames().then((gs) => {
        const last = gs.filter((g) => cleanMinutes(g.halfMinutes, g.periods)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        if (last) setD((p) => (p.halves.some((h) => h) ? p : { ...p, halves: halvesOf(last) }))
      }, () => {})
      return
    }
    repo.getGame(id).then((g) => {
      if (!g) return
      setExisting(g)
      setD({ opponent: g.opponent, date: g.date, home: g.home, location: g.location ?? '', notes: g.notes ?? '', halves: halvesOf(g) })
    })
  }, [id, repo])

  const set = <K extends keyof GameDraft>(k: K, v: GameDraft[K]) => setD((p) => ({ ...p, [k]: v }))
  /** Halves are usually the same length, so the 2nd half follows the 1st until it is changed on its own. */
  const setHalf = (i: number, v: string) => setD((p) => ({
    ...p, halves: p.halves.map((h, j) => (j === i || (i === 0 && j > 0 && h === p.halves[0]) ? v : h)),
  }))
  const minutes = draftMinutes(d.halves)

  async function save(startTracking: boolean) {
    const errs = validateDraft(d)
    setErrors(errs)
    if (Object.keys(errs).length) { document.getElementById(errs.opponent ? 'gf-opp' : errs.date ? 'gf-date' : 'gf-half1')?.focus(); return }
    setBusy(true); setFailure('')
    try {
      const g = await repo.saveGame({
        id: existing?.id, opponent: d.opponent.trim(), date: d.date, home: d.home, periods: 2, // soccer: always two halves
        location: d.location.trim() || undefined, notes: d.notes.trim() || undefined,
        score: existing?.score, // entered on the summary; editing the game must not lose it
        halfMinutes: minutes ?? (existing?.halfMinutes !== undefined ? null : undefined),
        clock: existing?.clock, // run from the tracker; same
        status: startTracking && existing?.status !== 'final' ? 'live' : existing?.status ?? 'scheduled',
      })
      nav(startTracking ? `/games/${g.id}/track` : '/', { replace: true })
    } catch (e) {
      setFailure((e as Error).message || 'Could not save. Try again.')
      setBusy(false)
    }
  }

  async function useMyLocation() {
    setLocating(true); setLocError('')
    try { set('location', await locateField()) }
    catch (e) { setLocError((e as Error).message) }
    finally { setLocating(false) }
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
        <fieldset className="ss-field gm-halves" aria-describedby={errors.halves ? 'gf-half-err' : 'gf-half-total'}>
          <legend className="ss-label">Half length <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(minutes)</span></legend>
          <div className="gm-halves-row">
            {d.halves.map((h, i) => (
              <label key={i} className="gm-half">
                <span>{i === 0 ? '1st half' : '2nd half'}</span>
                <input id={`gf-half${i + 1}`} className="ss-input" type="number" inputMode="numeric" min={1} max={MAX_HALF_MINUTES} step={1}
                  value={h} onChange={(e) => setHalf(i, e.target.value)} placeholder="e.g. 25" enterKeyHint="next"
                  aria-invalid={!!errors.halves} />
              </label>
            ))}
          </div>
          <div id="gf-half-total" className="gm-half-total" aria-live="polite">
            {minutes ? <>Full game: <b>{minutes.reduce((a, b) => a + b, 0)} min</b></> : 'Sets the game clock on the tracker. It varies by age group and tournament.'}
          </div>
          {errors.halves && <div id="gf-half-err" className="ss-error" role="alert">{errors.halves}</div>}
        </fieldset>
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-loc">Location <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <div className="gm-loc">
            <input id="gf-loc" className="ss-input" value={d.location} onChange={(e) => set('location', e.target.value)} placeholder="Field name or address" autoComplete="off" enterKeyHint="next"
              aria-describedby={locError ? 'gf-loc-err' : undefined} />
            <button type="button" className="gm-loc-btn" onClick={useMyLocation} disabled={locating}
              aria-label={locating ? 'Finding your location' : 'Use my location'} title="Use my location">
              <Icon name="pin" size={22} className={locating ? 'icon gm-loc-spin' : 'icon'} />
            </button>
          </div>
          {locError && <div id="gf-loc-err" className="ss-error" role="alert">{locError}</div>}
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
