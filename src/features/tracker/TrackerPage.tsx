import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { summarize } from '../../lib/summary'
import { canThank } from '../../lib/thanks'
import { ThanksHeart } from '../thanks/ThanksHeart'
import { InfoButton } from '../guide/InfoButton'
import { LANES, LANE_OF, ROLE_LABEL, lanesText, roleOf, type Lane, type Role } from '../../lib/lanes'
import { RolePanel } from './RolePanel'
import { StatCard, type StatButton } from './StatCard'
import { FieldPad } from './FieldPad'
import { TAP_STYLES, TAP_STYLE_KEY, swapKey, usePref } from './prefs'
import { attacksLeft, zoneText } from '../../lib/zones'
import { agoText, eventLabel, isGood, tallyText } from './labels'
import { useTracker, useWakeLock } from './useTracker'
import './tracker.css'
import { PillGroup, PillItem } from '../../ui/PillGroup'
import { HalftimeSheet } from '../stats/HalftimeSheet'
import { ScoreBar } from './ScoreBar'
import { ClockBar } from './ClockBar'
import { gameMs } from '../../lib/clock'
import { scoreText } from '../../lib/score'
import { useTeam } from '../shell/useTeam'
import { Icon } from '../../ui/Icon'
import { kickoffText } from '../../lib/schedule'

const SYNC_TEXT = { synced: 'Synced', syncing: 'Syncing', offline: 'Offline', error: 'Sync error' } as const

const shortDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function TrackerPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const t = useTracker(id)
  useWakeLock()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confirmRole, setConfirmRole] = useState<Role | null>(null) // asking before taking a lane from someone
  const { game, summary: s, periodSummary: p } = t
  const { team } = useTeam()
  const goals = team?.goals ?? {}
  const [tapStyle, setTapStyle] = usePref(TAP_STYLE_KEY, TAP_STYLES, 'field')
  const [swapped, setSwapped] = usePref(swapKey(id), ['0', '1'] as const, '0')

  if (!t.loaded) return <main className="tk"><p className="tk-empty">Loading game…</p></main>
  if (!game) return <main className="tk"><p className="tk-empty">Game not found. <Link to="/">Back to games</Link></p></main>

  const locked = game.status === 'final'
  const onField = tapStyle === 'field'
  /** In buttons mode a card carries its own buttons; on the field the taps happen there and the card just keeps score. */
  const btns = (b: [StatButton, StatButton]) => (onField ? undefined : b)
  const readOnly = !t.canTrack // final, still checking, or someone else has every lane
  const sync = t.sync
  const syncLabel = sync.state !== 'synced' && sync.pending > 0 ? `${SYNC_TEXT[sync.state]} · ${sync.pending} pending` : SYNC_TEXT[sync.state]
  const recent = (t.canTrack ? t.events.filter((e) => t.held.includes(LANE_OF[e.category])) : t.events).slice().reverse().slice(0, 6)
  const ft = s.firstContact
  const pf = p.firstContact

  // Other phones, from the server's last answer: who holds which lane, and which lanes nobody holds.
  const others = LANES.filter((l) => t.lanes?.[l].holder === 'other')
  const open = LANES.filter((l) => t.lanes?.[l].holder === 'none' && !t.held.includes(l))
  const nameOf = (l: Lane) => t.lanes?.[l].name || 'Another parent'
  const idleOf = (ls: Lane[]) => (ls.length ? t.lanes?.[ls[0]].idleSeconds ?? null : null)
  /** "Sam is tracking defense and Priya is tracking offense": these lanes, grouped by who has them. */
  const trackingText = (ls: Lane[]) =>
    [...new Set(ls.map(nameOf))].map((n) => `${n} is tracking ${lanesText(ls.filter((l) => nameOf(l) === n))}`).join(' and ')

  /** A stat card is only tappable when this phone holds its lane; otherwise say who does. */
  const cardProps = (lane: Lane) => ({
    disabled: !t.canTap(lane),
    note: t.canTrack && !t.canTap(lane) ? (t.lanes?.[lane].holder === 'other' ? `${nameOf(lane)} is tracking this` : 'Nobody is tracking this yet') : undefined,
  })

  // Taking a lane from someone who is actively tracking it asks first; taking a free one doesn't.
  const pick = (role: Role) => (t.blockersFor(role).length ? setConfirmRole(role) : void t.pickRole(role))
  const taking = confirmRole ? t.blockersFor(confirmRole).map((b) => b.lane) : []
  const keeping = LANES.filter((l) => others.includes(l) && !taking.includes(l) && taking.some((x) => nameOf(x) === nameOf(l)))

  const endGame = async () => {
    await t.setStatus('final')
    nav(`/games/${game.id}`)
  }

  return (
    <div className="tk-lockwrap">
    {/* Before game day the tracker is shown as it will look, under a lock: nothing behind it can be reached. */}
    <main className="tk" inert={t.early || undefined} aria-hidden={t.early || undefined}>
      <header className="tk-top">
        <div className="tk-top-row">
          <Link to="/" className="tk-back" aria-label="Back to games">‹</Link>
          <div className="tk-title">
            <h1>{game.home ? 'vs' : '@'} {game.opponent}</h1>
            <span className={`tk-status ${game.status}`}>
              {game.status === 'live' ? '● Live' : game.status === 'final' ? 'Final' : 'Not started'}
              {t.canTrack && ` · Tracking ${lanesText(t.held)}`}{t.watching && ' · Watching'}
            </span>
          </div>
          <span className={`tk-sync ${sync.state}`} role="status" aria-label={`Sync status: ${syncLabel}`}>
            <i aria-hidden="true" />{SYNC_TEXT[sync.state]}
            {sync.state !== 'synced' && sync.pending > 0 && <b className="tk-sync-n" aria-hidden="true">{sync.pending}</b>}
          </span>
        </div>
        {/* The score and the clock share a row, each in its own box. */}
        <div className="tk-board">
          {game.status !== 'scheduled' && <ScoreBar game={game} teamName={team?.name ?? ''} canEdit={t.canTrack} onChange={t.changeScore} />}
          {(!locked || gameMs(game.clock) > 0) && <ClockBar game={game} period={t.period} canEdit={t.canTrack} onChange={t.changeClock} />}
        </div>
        <div className="tk-periods" role="group" aria-label="Period">
          <PillGroup value={String(t.period)} pillClassName="tk-period-pill">
            {Array.from({ length: game.periods }, (_, i) => i + 1).map((n) => (
              <PillItem key={n} value={String(n)} className="tk-period-item">
                <button type="button" aria-pressed={t.period === n} onClick={() => t.setPeriod(n)}>
                  {n === 1 ? '1st half' : '2nd half'}
                </button>
              </PillItem>
            ))}
          </PillGroup>
        </div>
        <HalftimeSheet game={game} events={t.events} goals={goals} />
      </header>

      {/* The parent tracking is the one being thanked, so they see the hearts; everyone else can give one. */}
      {canThank(game.status) && <ThanksHeart gameId={game.id} readOnly={t.canTrack || (t.checking && !locked)} />}

      {t.watching && (
        <section className="tk-watch" role="status" aria-live="polite" aria-label="Who is tracking">
          {others.length ? (
            <>
              <strong>{t.lost.length ? `${nameOf(t.lost[0])} took over tracking` : trackingText(others)}</strong>
              <p>
                {t.lost.length ? 'Your taps so far are saved. ' : `Active ${agoText(idleOf(others))}. `}
                {open.length > 0 && `${open.map((l) => ROLE_LABEL[l]).join(' and ')} ${open.length > 1 ? 'are' : 'is'} open. `}
                You're watching live: the numbers update as they tap. Pick what you want to track below to join in.
              </p>
            </>
          ) : (
            <>
              <strong>Nobody is tracking right now</strong>
              <p>Start tracking to record taps for this game. Everyone else will watch live.</p>
            </>
          )}
          {open.length > 0 && (
            <button type="button" className={`tk-watch-btn${others.length ? '' : ' primary'}`} onClick={() => void t.pickRole(roleOf(open)!)}>
              {others.length ? `Track ${lanesText(open)}` : 'Start tracking'}
            </button>
          )}
        </section>
      )}

      {game.status === 'scheduled' && t.canTrack && (
        <button type="button" className="tk-start" onClick={() => t.setStatus('live')}>▶ Start game</button>
      )}
      {locked && <p className="tk-final">Game is final. <Link to={`/games/${game.id}`}>View summary</Link></p>}

      {!locked && onField && (
        <FieldPad events={t.events} period={t.period} attacksLeft={attacksLeft(t.period, game.periods, swapped === '1')}
          onSwap={() => setSwapped(swapped === '1' ? '0' : '1')}
          defense={{ enabled: t.canTap('defense'), note: cardProps('defense').note }}
          offense={{ enabled: t.canTap('offense'), note: cardProps('offense').note }}
          onDefense={(zone, pick) => (pick.category === 'duel' ? t.recordDuel(pick.outcome, zone) : t.recordContact(pick.outcome, zone, pick.ballType))}
          onBox={(zone, outcome, at) => t.recordBox(outcome, zone, at)} />
      )}

      {/* What this phone tracks and how it taps are set once, so they sit below the field, which must be in reach. */}
      {!locked && !t.checking && (
        <RolePanel role={t.role} held={t.held} lanes={t.lanes} hint={t.events.length === 0} onPick={pick} />
      )}

      {!locked && (
        <div className="tk-style" role="group" aria-label="Tap on">
          <span>Tap on</span>
          {TAP_STYLES.map((v) => (
            <button key={v} type="button" aria-pressed={tapStyle === v} onClick={() => setTapStyle(v)}>{v === 'field' ? 'Field' : 'Buttons'}</button>
          ))}
        </div>
      )}

      {[
        { lane: LANE_OF.duel, el: (
          <StatCard key="duel" id="duel" title="Defensive 1v1s" hint="Did we win the duel?" info={<InfoButton topic="duel" tracking />}
            tally={tallyText(s.duels.won, s.duels.total, s.duels.winPct)}
            periodTally={`${p.duels.won}/${p.duels.total}`} period={t.period} pct={s.duels.winPct} goal={goals.duel} {...cardProps(LANE_OF.duel)}
            buttons={btns([
              { label: 'Won', icon: '✓', tone: 'good', aria: 'Duel won', onTap: () => t.recordDuel('won') },
              { label: 'Lost', icon: '✕', tone: 'bad', aria: 'Duel lost', onTap: () => t.recordDuel('lost') },
            ])} />
        ) },
        { lane: LANE_OF.first_contact, el: (
          <StatCard key="contact" id="contact" title="First contact" hint="Through balls and long balls" info={<InfoButton topic="first_contact" tracking />}
            tally={tallyText(ft.clean, ft.total, ft.cleanPct)}
            periodTally={`${pf.clean}/${pf.total}`} period={t.period} pct={ft.cleanPct} goal={goals.first_contact} {...cardProps(LANE_OF.first_contact)}
            extra={onField ? (
              <p className="tk-split">Through ball {ft.throughBall.clean}/{ft.throughBall.clean + ft.throughBall.miss} · Long ball {ft.longBall.clean}/{ft.longBall.clean + ft.longBall.miss}</p>
            ) : (
              <div className="tk-seg" role="radiogroup" aria-label="Ball type">
                <PillGroup value={t.ballType} pillClassName="tk-seg-pill">
                  {([['through_ball', 'Through ball', ft.throughBall], ['long_ball', 'Long ball', ft.longBall]] as const).map(([v, label, b]) => (
                    <PillItem key={v} value={v} className="tk-seg-item">
                      <button type="button" role="radio" aria-checked={t.ballType === v} onClick={() => t.setBallType(v)}>
                        {label}<small>{b.clean}/{b.clean + b.miss}</small>
                      </button>
                    </PillItem>
                  ))}
                </PillGroup>
              </div>
            )}
            buttons={btns([
              { label: 'Clean', icon: '✓', tone: 'good', aria: 'First contact clean', onTap: () => t.recordContact('clean') },
              { label: 'Miss', icon: '✕', tone: 'bad', aria: 'First contact miss', onTap: () => t.recordContact('miss') },
            ])} />
        ) },
        { lane: LANE_OF.box_entry, el: (
          <StatCard key="box" id="box" title="Box entries" hint="Got into the box: did we shoot?" info={<InfoButton topic="box_entry" tracking />}
            tally={tallyText(s.boxEntries.shot, s.boxEntries.total, s.boxEntries.shotPct)}
            periodTally={`${p.boxEntries.shot}/${p.boxEntries.total}`} period={t.period} pct={s.boxEntries.shotPct} goal={goals.box_entry} {...cardProps(LANE_OF.box_entry)}
            buttons={btns([
              { label: 'Shot', icon: '◎', tone: 'good', aria: 'Box entry with shot', onTap: () => t.recordBox('shot') },
              { label: 'No shot', icon: '⊘', tone: 'bad', aria: 'Box entry, no shot', onTap: () => t.recordBox('no_shot') },
            ])} />
        ) },
      ]
        // This phone's stats first: someone tracking offense shouldn't have to scroll past the 1v1s to reach their buttons.
        .sort((a, b) => Number(t.canTap(b.lane)) - Number(t.canTap(a.lane)))
        .map((c) => c.el as ReactNode)}

      <section className="tk-recent" aria-label="Recent taps">
        <h2>Recent taps</h2>
        {recent.length === 0 ? <p className="tk-empty">{t.canTrack ? 'Nothing yet. Tap a button above.' : 'Nothing yet. Taps will show up here as they happen.'}</p> : (
          <ul>
            {recent.map((e) => (
              <li key={e.id} className={isGood(e) ? 'good' : 'bad'}>
                <span className="tk-ico" aria-hidden="true">{isGood(e) ? '✓' : '✕'}</span>
                <span className="lbl">{eventLabel(e)}{e.zone && <small>{zoneText(e.zone)}</small>}</span>
                <span className="per">P{e.period}</span>
                {t.canTap(LANE_OF[e.category]) && <button type="button" aria-label={`Undo ${eventLabel(e)}`} onClick={() => t.undo(e)}>Undo</button>}
              </li>
            ))}
          </ul>
        )}
        {game.status === 'live' && t.canTrack && (
          <button type="button" className="tk-end" onClick={() => setConfirmEnd(true)}>End game</button>
        )}
      </section>

      {t.toast && <div className="tk-toast" key={t.toast.key} role="status" aria-live="polite">{t.toast.msg}</div>}

      {!t.watching && (
        <div className="tk-undo">
          <button type="button" className="tk-undo-btn" disabled={!t.last || readOnly} onClick={() => t.undo()}
            aria-label={t.last ? `Undo last: ${eventLabel(t.last)}` : 'Undo last tap'}>
            <span aria-hidden="true">↶</span>
            <span className="txt"><b>Undo</b><small>{t.last ? eventLabel(t.last) : 'nothing to undo'}</small></span>
          </button>
        </div>
      )}

      {confirmRole && (
        <div className="tk-scrim" onClick={() => setConfirmRole(null)}>
          <div className="tk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="take-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="take-h">Take over {lanesText(taking)}?</h2>
            <p>
              {trackingText(taking)} (active {agoText(idleOf(taking))}). If you take over, they can't tap {taking.length > 1 ? 'those' : 'that'} until
              they take it back.{keeping.length > 0 && ` ${nameOf(keeping[0])} keeps ${lanesText(keeping)}.`} Check with them first so the
              same play isn't counted twice.
            </p>
            <div>
              <button type="button" autoFocus onClick={() => setConfirmRole(null)}>Not now</button>
              <button type="button" className="primary" onClick={() => { const r = confirmRole; setConfirmRole(null); void t.pickRole(r, true) }}>Take over</button>
            </div>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="tk-scrim" onClick={() => setConfirmEnd(false)}>
          <div className="tk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="end-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="end-h">End game?</h2>
            <p>
              {summarize(t.events).duels.total + ft.total + s.boxEntries.total} taps recorded{scoreText(game) ? `, final score ${scoreText(game)}` : ''}. You will see the summary next, where anyone can fix the score.
              {others.length > 0 && ` ${trackingText(others)} too, and ending the game ends it for them.`}
            </p>
            <div>
              <button type="button" autoFocus onClick={() => setConfirmEnd(false)}>Keep tracking</button>
              <button type="button" className="danger" onClick={endGame}>End game</button>
            </div>
          </div>
        </div>
      )}
    </main>
    {t.early && (
      <section className="tk-lock" role="status" aria-label="Tracking is locked">
        <div className="tk-lock-card">
          <div className="tk-lock-eyebrow"><Icon name="lock" size={18} /> Tracking opens on game day</div>
          <h2 className="tk-lock-opp">{game.home ? 'vs' : '@'} {game.opponent}</h2>
          <dl className="tk-lock-when">
            <div><dt>Date</dt><dd>{shortDate(game.date)}</dd></div>
            {kickoffText(game.kickoff) && <div><dt>Kick-off</dt><dd>{kickoffText(game.kickoff)}</dd></div>}
          </dl>
          {game.location && <p className="tk-lock-where">{game.location}</p>}
          <Link to="/" className="tk-lock-back">‹ Back to games</Link>
        </div>
      </section>
    )}
    </div>
  )
}
