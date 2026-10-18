import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRepo } from '../../data/context'
import type { Game } from '../../types'
import '../shell/shell.css'
import './games.css'
import { PillGroup, PillItem } from '../../ui/PillGroup'
import { Icon } from '../../ui/Icon'
import { locateField } from './locate'
import { cleanMinutes, HALF_LENGTHS } from '../../lib/clock'
import { cleanKickoff, nextWeek, todayISO } from '../../lib/schedule'

export { todayISO }

/** `half` is the length of each half in minutes, as picked ('' = not set). Both halves are always the same length. `kickoff` is "HH:MM" or ''. */
export interface GameDraft { opponent: string; date: string; kickoff: string; home: boolean; location: string; notes: string; half: string }
export function validateDraft(d: GameDraft): Partial<Record<'opponent' | 'date', string>> {
  const e: Partial<Record<'opponent' | 'date', string>> = {}
  if (!d.opponent.trim()) e.opponent = 'Who are we playing? Enter the opponent.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) e.date = 'Pick a valid date.'
  return e
}

/** The half length a game was saved with ('' = none). */
const halfOf = (g?: Pick<Game, 'halfMinutes' | 'periods'> | null) => String(cleanMinutes(g?.halfMinutes, g?.periods)?.[0] ?? '')
const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export function Seg<T extends string | number>({ name, legend, value, options, onChange }: {
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
  const [d, setD] = useState<GameDraft>({ opponent: '', date: todayISO(), kickoff: '', home: true, location: '', notes: '', half: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [added, setAdded] = useState('')

  useEffect(() => {
    if (!id) {
      // A new game starts with the half lengths of the team's latest game: they rarely change from week to week.
      repo.listGames().then((gs) => {
        const last = gs.filter((g) => cleanMinutes(g.halfMinutes, g.periods)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        if (last) setD((p) => (p.half ? p : { ...p, half: halfOf(last) }))
      }, () => {})
      return
    }
    repo.getGame(id).then((g) => {
      if (!g) return
      setExisting(g)
      setD({ opponent: g.opponent, date: g.date, kickoff: cleanKickoff(g.kickoff) ?? '', home: g.home, location: g.location ?? '', notes: g.notes ?? '', half: halfOf(g) })
    })
  }, [id, repo])

  const set = <K extends keyof GameDraft>(k: K, v: GameDraft[K]) => setD((p) => ({ ...p, [k]: v }))
  const half = Number(d.half) || 0
  // An older game may have a length that isn't one of the choices any more: keep it on the list so editing doesn't lose it.
  const choices = half && !HALF_LENGTHS.includes(half) ? [...HALF_LENGTHS, half].sort((a, b) => a - b) : HALF_LENGTHS

  // A game later in the season isn't tracked yet: saving it (and adding the next one) is what you want.
  const later = d.date > todayISO()

  /** `then`: open the tracker, go back to the games, or clear the form for the next game of the season. */
  async function save(then: 'track' | 'list' | 'another') {
    const startTracking = then === 'track'
    const errs = validateDraft(d)
    setErrors(errs)
    if (Object.keys(errs).length) { document.getElementById(errs.opponent ? 'gf-opp' : 'gf-date')?.focus(); return }
    setBusy(true); setFailure('')
    try {
      const g = await repo.saveGame({
        id: existing?.id, opponent: d.opponent.trim(), date: d.date, home: d.home, periods: 2, // soccer: always two halves
        location: d.location.trim() || undefined, notes: d.notes.trim() || undefined,
        kickoff: cleanKickoff(d.kickoff) ?? (existing?.kickoff !== undefined ? null : undefined),
        score: existing?.score, // entered on the summary; editing the game must not lose it
        halfMinutes: half ? [half, half] : existing?.halfMinutes !== undefined ? null : undefined,
        clock: existing?.clock, // run from the tracker; same
        status: startTracking && existing?.status !== 'final' ? 'live' : existing?.status ?? 'scheduled',
      })
      if (then === 'another') {
        // Most of a season's games are a week apart, at the same time and with the same half length: keep those.
        setAdded(`Added ${g.home ? 'vs' : '@'} ${g.opponent} on ${fmtDate(g.date)}. Next game:`)
        setD((p) => ({ ...p, opponent: '', location: '', notes: '', date: nextWeek(p.date) }))
        setErrors({}); setBusy(false)
        document.getElementById('gf-opp')?.focus()
        return
      }
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

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void save('list') }

  return (
    <main className="ss-page">
      <Link to="/" className="gm-back">‹ Games</Link>
      <h1 className="ss-h1">{id ? 'Edit game' : 'New game'}</h1>
      {added && <p className="gm-added" role="status">{added}</p>}
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
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-time">Kick-off <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <input id="gf-time" type="time" className="ss-input" value={d.kickoff} onChange={(e) => set('kickoff', e.target.value)} />
        </div>
        <Seg name="ha" legend="Home or away" value={d.home ? 'home' : 'away'} onChange={(v) => set('home', v === 'home')}
          options={[{ v: 'home', label: 'Home' }, { v: 'away', label: 'Away' }]} />
        <div className="ss-field">
          <label className="ss-label" htmlFor="gf-half">Half length</label>
          <select id="gf-half" className="ss-input gm-half-select" value={d.half} onChange={(e) => set('half', e.target.value)} aria-describedby="gf-half-total">
            <option value="">Not set</option>
            {choices.map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
          <div id="gf-half-total" className="gm-half-total" aria-live="polite">
            {half ? <>Both halves. Full game: <b>{half * 2} min</b></> : 'Used for both halves. Sets the game clock on the tracker.'}
          </div>
        </div>
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
          {later ? (
            <button type="submit" className="ss-btn ss-btn-primary ss-btn-big" disabled={busy}>Save</button>
          ) : (
            <>
              <button type="button" className="ss-btn ss-btn-primary ss-btn-big" disabled={busy} onClick={() => save('track')}>Save &amp; start tracking</button>
              <button type="submit" className="ss-btn" disabled={busy}>Save</button>
            </>
          )}
          {!id && <button type="button" className="ss-btn" disabled={busy} onClick={() => save('another')}>Save &amp; add another</button>}
        </div>
      </form>
    </main>
  )
}
