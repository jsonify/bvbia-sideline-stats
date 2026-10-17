import { useEffect, useRef, useState } from 'react'
import type { BallType, StatEvent } from '../../types'
import { BOX_ZONES, CHANNELS, DEFENSE_ZONES, zoneText, type BoxZone, type DefenseZone, type Zone } from '../../lib/zones'

/** How long a box entry waits for Shot / No shot before it saves itself as No shot. */
export const BOX_WAIT_MS = 8_000

export type DefensePick =
  | { category: 'duel'; outcome: 'won' | 'lost' }
  | { category: 'first_contact'; outcome: 'clean' | 'miss'; ballType: BallType }

interface Side { enabled: boolean; note?: string }

interface Props {
  /** Every live tap of the game, for the count shown in each zone. */
  events: StatEvent[]
  period: number
  /** True when we attack to the left of the screen (normally the second half). */
  attacksLeft: boolean
  defense: Side
  offense: Side
  onSwap: () => void
  onDefense: (zone: DefenseZone, pick: DefensePick) => void
  onBox: (zone: BoxZone, outcome: 'shot' | 'no_shot', period: number) => void
}

type Pending = { kind: 'box'; zone: BoxZone; period: number; key: number } | { kind: 'def'; zone: DefenseZone }

// Each half is drawn as if we attack to the right (our goal on the left, theirs on the right, our left channel at the top),
// in a 100 x 100 box stretched to fit. When we attack to the left the whole picture turns round, so a zone is always
// in the same place relative to the goals, which is how the parent on the sideline sees it.
const ROWS = CHANNELS // l, c, r from top to bottom
const DEF_COLS = ['def', 'mid'] as const // our goal, then halfway
const BOX_COLS = ['edge', 'near'] as const // the line of the box, then their goal

function OurHalf() {
  return (
    <svg className="fp-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x={0} y={20.4} width={31.4} height={59.2} />
      <rect x={0} y={36.5} width={10.5} height={27} />
      <path d="M100 36.5 A17.4 13.5 0 0 0 100 63.5" />
      <line className="fp-goal" x1={1} y1={44.6} x2={1} y2={55.4} />
      <path className="fp-split" d="M50 0V100M0 33.33H100M0 66.67H100" />
    </svg>
  )
}

function TheirBox() {
  return (
    <svg className="fp-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x={66.7} y={27.3} width={33.3} height={45.4} />
      <line className="fp-goal" x1={99} y1={41} x2={99} y2={59} />
      <path className="fp-split" d="M50 0V100M0 33.33H100M0 66.67H100" />
    </svg>
  )
}

/**
 * The tracker's field: tap where the play happened, then say what happened. Our half takes the defensive stats, their box
 * the box entries. A box entry is tapped as the player gets in; if nobody says Shot within a few seconds it saves as
 * No shot, so the common case is a single tap.
 */
export function FieldPad({ events, period, attacksLeft, defense, offense, onSwap, onDefense, onBox }: Props) {
  const [pending, setPending] = useState<Pending | null>(null)
  const seq = useRef(0)
  const onBoxRef = useRef(onBox)
  onBoxRef.current = onBox
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  /** Save a waiting box entry as No shot (another tap came first, the wait ran out, or the screen is closing). */
  const settle = () => {
    const p = pendingRef.current
    if (p?.kind === 'box') onBoxRef.current(p.zone, 'no_shot', p.period)
    pendingRef.current = null
  }

  useEffect(() => {
    if (pending?.kind !== 'box') return
    const t = setTimeout(() => { settle(); setPending(null) }, BOX_WAIT_MS)
    return () => clearTimeout(t)
  }, [pending])
  useEffect(() => () => settle(), [])

  // A side that stops being ours (someone took it over) drops what it was asking.
  useEffect(() => {
    if ((pending?.kind === 'box' && !offense.enabled) || (pending?.kind === 'def' && !defense.enabled)) setPending(null)
  }, [pending, offense.enabled, defense.enabled])

  const tapBox = (zone: BoxZone) => { settle(); setPending({ kind: 'box', zone, period, key: ++seq.current }) }
  const tapDef = (zone: DefenseZone) => { settle(); setPending({ kind: 'def', zone }) }
  const done = () => { pendingRef.current = null; setPending(null) }

  const counts = new Map<Zone, number>()
  for (const e of events) if (e.zone) counts.set(e.zone, (counts.get(e.zone) ?? 0) + 1)

  const zoneBtn = (zone: Zone, side: Side, label: string, onTap: () => void) => {
    const n = counts.get(zone) ?? 0
    return (
      <button key={zone} type="button" className={`fp-zone${pending?.zone === zone ? ' on' : ''}`} disabled={!side.enabled}
        aria-pressed={pending?.zone === zone} aria-label={`${label}: ${zoneText(zone)}${n ? `, ${n} so far` : ''}`} onClick={onTap}>
        {n > 0 && <span>{n}</span>}
      </button>
    )
  }

  const ours = (
    <div className={`fp-half fp-ours${defense.enabled ? '' : ' off'}`} key="ours">
      <div className="fp-pitch">
        <OurHalf />
        <div className="fp-grid">
          {ROWS.flatMap((c) => DEF_COLS.map((d) => zoneBtn(`${d}_${c}` as DefenseZone, defense, 'Our half', () => tapDef(`${d}_${c}` as DefenseZone))))}
        </div>
      </div>
      {defense.note && <p className="fp-note">{defense.note}</p>}
    </div>
  )
  const theirs = (
    <div className={`fp-half fp-box${offense.enabled ? '' : ' off'}`} key="theirs">
      <div className="fp-pitch">
        <TheirBox />
        <div className="fp-grid">
          {ROWS.flatMap((c) => BOX_COLS.map((d) => zoneBtn(`${d}_${c}` as BoxZone, offense, 'Their box', () => tapBox(`${d}_${c}` as BoxZone))))}
        </div>
      </div>
      {offense.note && <p className="fp-note">{offense.note}</p>}
    </div>
  )

  // Only show the sides this phone taps: a phone on offense gets the whole width for the box. A phone that taps
  // neither (watching) sees both, with the counts.
  const showOurs = defense.enabled || !offense.enabled
  const showTheirs = offense.enabled || !defense.enabled
  const labels = [showOurs && 'Our half', attacksLeft ? '← Attacking' : 'Attacking →', showTheirs && 'Their box'].filter(Boolean) as string[]

  return (
    <section className={`fp${attacksLeft ? ' flip' : ''}${showOurs && showTheirs ? '' : ' one'}`} aria-label="Field">
      <div className="fp-head">
        <div className="fp-labels" aria-hidden="true">{labels.map((l) => <span key={l}>{l}</span>)}</div>
        <button type="button" className="fp-swap" onClick={onSwap} aria-label={`Swap ends: we are attacking to the ${attacksLeft ? 'left' : 'right'}`}>⇄ Swap</button>
      </div>
      <div className="fp-field">{showOurs && ours}{showTheirs && theirs}</div>
      {!pending && (
        <p className="fp-hint">
          {offense.enabled && defense.enabled ? 'Tap where the play happened: our half for 1v1s and first contact, their box for box entries.'
            : offense.enabled ? 'Tap the zone of their box where we got in.'
            : defense.enabled ? 'Tap the zone of our half where the play happened.'
            : 'Taps show up here as they happen.'}
        </p>
      )}

      {/* What happened is asked in a sheet pinned to the bottom of the screen (over the Undo bar), so the parent never
          has to scroll to answer, wherever the page is. */}
      {pending?.kind === 'box' ? (
        <div className="fp-pick" role="group" aria-label={`Box entry, ${zoneText(pending.zone)}`} key={pending.key}>
          <p className="fp-pick-h"><span><b>Box entry</b> · {zoneText(pending.zone)}</span><button type="button" onClick={done}>Cancel</button></p>
          <div className="fp-row">
            <button type="button" className="tk-btn good" aria-label="Box entry with shot" onClick={() => { onBox(pending.zone, 'shot', pending.period); done() }}>
              <span className="tk-ico" aria-hidden="true">◎</span><span>Shot</span>
            </button>
            <button type="button" className="tk-btn bad" aria-label="Box entry, no shot" onClick={() => { onBox(pending.zone, 'no_shot', pending.period); done() }}>
              <span className="tk-ico" aria-hidden="true">⊘</span><span>No shot</span>
            </button>
          </div>
          <div className="fp-wait" aria-hidden="true"><i style={{ animationDuration: `${BOX_WAIT_MS}ms` }} /></div>
          <p className="fp-pick-foot">No tap saves it as No shot</p>
        </div>
      ) : pending?.kind === 'def' ? (
        <div className="fp-pick" role="group" aria-label={`Our half, ${zoneText(pending.zone)}`}>
          <p className="fp-pick-h"><span><b>Our half</b> · {zoneText(pending.zone)}</span><button type="button" onClick={done}>Cancel</button></p>
          {([
            ['1v1', [['Won', '✓', 'good', 'Duel won', { category: 'duel', outcome: 'won' }], ['Lost', '✕', 'bad', 'Duel lost', { category: 'duel', outcome: 'lost' }]]],
            ['Through ball', [
              ['Clean', '✓', 'good', 'Through ball clean', { category: 'first_contact', outcome: 'clean', ballType: 'through_ball' }],
              ['Miss', '✕', 'bad', 'Through ball miss', { category: 'first_contact', outcome: 'miss', ballType: 'through_ball' }]]],
            ['Long ball', [
              ['Clean', '✓', 'good', 'Long ball clean', { category: 'first_contact', outcome: 'clean', ballType: 'long_ball' }],
              ['Miss', '✕', 'bad', 'Long ball miss', { category: 'first_contact', outcome: 'miss', ballType: 'long_ball' }]]],
          ] as [string, [string, string, 'good' | 'bad', string, DefensePick][]][]).map(([title, btns]) => (
            <div className="fp-row labelled" key={title}>
              <span className="fp-row-h">{title}</span>
              {btns.map(([label, icon, tone, aria, pick]) => (
                <button key={label} type="button" className={`tk-btn ${tone}`} aria-label={aria} onClick={() => { onDefense(pending.zone, pick); done() }}>
                  <span className="tk-ico" aria-hidden="true">{icon}</span><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
