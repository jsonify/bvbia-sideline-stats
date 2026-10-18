import '../branding/branding.css'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { resultOf, scoreText } from '../../lib/score'
import { useRepo } from '../../data/context'
import { useRemembered } from '../../data/remember'
import { heartsFor } from '../../lib/thanks'
import { summarize } from '../../lib/summary'
import { bySchedule, byMonth, kickoffText, nextGame } from '../../lib/schedule'
import { Seg, todayISO } from './GameFormPage'
import { Sheet } from '../../ui/Sheet'
import { ThanksTag } from '../thanks/ThanksHeart'
import { useThanks } from '../thanks/useThanks'
import type { Game, StatSummary } from '../../types'
import '../shell/shell.css'
import './games.css'

const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const statusLabel = { scheduled: 'Upcoming', live: 'Live', final: 'Final' } as const
/** A scheduled game whose day has passed was never tracked; say so rather than "Upcoming". */
const statusOf = (g: Game, today: string) => (g.status === 'scheduled' && g.date < today ? 'Not tracked' : statusLabel[g.status])
/** "Sat, Oct 24 · 10:30 AM" */
const whenOf = (g: Game) => [fmtDate(g.date), kickoffText(g.kickoff)].filter(Boolean).join(' · ')

function EmptyArt() {
  return (
    <svg viewBox="0 0 200 140" role="img" aria-label="A soccer ball on a pitch">
      <rect x="10" y="30" width="180" height="100" rx="12" fill="var(--brand)" opacity=".15" />
      <rect x="10" y="30" width="180" height="100" rx="12" fill="none" stroke="var(--brand)" strokeWidth="3" />
      <line x1="100" y1="30" x2="100" y2="130" stroke="var(--brand)" strokeWidth="3" />
      <circle cx="100" cy="80" r="18" fill="none" stroke="var(--brand)" strokeWidth="3" />
      <circle cx="100" cy="42" r="26" fill="var(--surface)" stroke="var(--text)" strokeWidth="3" />
      <path d="M100 30l10 8-4 12h-12l-4-12z" fill="var(--text)" />
    </svg>
  )
}

function Chips({ s }: { s: StatSummary }) {
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`)
  return (
    <div className="gm-chips" aria-label="Game stats">
      <span className="gm-stat">Duels {s.duels.won}/{s.duels.total} · {pct(s.duels.winPct)}</span>
      <span className="gm-stat">1st touch {pct(s.firstContact.cleanPct)}</span>
      <span className="gm-stat">Box {s.boxEntries.total} · {s.boxEntries.shot} shots</span>
    </div>
  )
}

function GameCard({ g, s, hearts, open, next, today, onMenu, onDelete }: {
  g: Game; s?: StatSummary; hearts: number; open: boolean; next?: boolean; today: string; onMenu: () => void; onDelete: () => void
}) {
  const to = g.status === 'live' ? `/games/${g.id}/track` : `/games/${g.id}`
  return (
    <li className={`gm-card${next ? ' gm-next' : ''}`}>
      <div className="ss-card">
        <Link to={to} className="ss-card-link">
          {next && <div className="gm-next-tag">Next game</div>}
          <div className="gm-opp">{g.home ? 'vs' : '@'} {g.opponent}</div>
          <div className="gm-meta">{whenOf(g)} · {g.home ? 'Home' : 'Away'} · {statusOf(g, today)}{scoreText(g) && <> <b className={`gm-score r-${resultOf(g)}`}>{scoreText(g)}{g.status === 'final' ? ` ${resultOf(g)}` : ''}</b></>}{g.location ? ` · ${g.location}` : ''}{hearts > 0 && <> · <ThanksTag n={hearts} /></>}</div>
          {g.status === 'final' && s && <Chips s={s} />}
        </Link>
        <button className="ss-icon-btn" aria-label={`Options for ${g.opponent}`} aria-haspopup="menu" aria-expanded={open} onClick={onMenu}>⋮</button>
      </div>
      {open && (
        <div className="gm-menu" role="menu">
          <Link role="menuitem" to={`/games/${g.id}/edit`}>Edit</Link>
          <button role="menuitem" className="danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </li>
  )
}

/** Every game of the season in date order, by month, with the record so far and how many are left. */
function SeasonSchedule({ games, card }: { games: Game[]; card: (g: Game) => ReactNode }) {
  const results = games.map(resultOf)
  const [w, d, l] = (['W', 'D', 'L'] as const).map((r) => results.filter((x) => x === r).length)
  const left = games.filter((g) => g.status !== 'final').length
  return (
    <>
      <p className="gm-season-sum">
        {games.length} {games.length === 1 ? 'game' : 'games'} · {left} to play{w + d + l > 0 && <> · Record <b>{w}-{d}-{l}</b></>}
      </p>
      {byMonth(games).map((m) => (
        <section key={m.key} aria-label={m.label}>
          <h2 className="ss-h2">{m.label}</h2>
          <ul className="gm-list">{m.games.map(card)}</ul>
        </section>
      ))}
    </>
  )
}

export default function GamesPage() {
  const repo = useRepo()
  const [games, setGames] = useRemembered<Game[] | null>(repo, 'games', null)
  const [stats, setStats] = useRemembered<Record<string, StatSummary>>(repo, 'game-stats', {})
  const [menu, setMenu] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Game | null>(null)
  const thanks = useThanks()
  const [view, setView] = useRemembered<'games' | 'season'>(repo, 'games-view', 'games')

  const load = useCallback(async () => {
    const list = await repo.listGames()
    setGames(list)
    const finals = list.filter((g) => g.status === 'final')
    const entries = await Promise.all(finals.map(async (g) => [g.id, summarize(await repo.listEvents(g.id))] as const))
    setStats(Object.fromEntries(entries))
  }, [repo, setGames, setStats])

  useEffect(() => { void load(); return repo.subscribe(() => void load()) }, [repo, load])

  if (!games) return <div className="ss-loading" role="status">Loading games…</div>

  const today = todayISO()
  const live = games.filter((g) => g.status === 'live')
  const upcoming = games.filter((g) => g.status === 'scheduled').sort(bySchedule)
  const final = games.filter((g) => g.status === 'final').sort((a, b) => bySchedule(b, a))
  const next = nextGame(games, today)
  const card = (g: Game) => (
    <GameCard key={g.id} g={g} s={stats[g.id]} hearts={heartsFor(thanks, g.id).length} open={menu === g.id}
      next={view === 'season' && g.id === next?.id} today={today}
      onMenu={() => setMenu(menu === g.id ? null : g.id)} onDelete={() => { setMenu(null); setConfirm(g) }} />
  )

  return (
    <main className="ss-page" onClick={(e) => { if (menu && !(e.target as HTMLElement).closest('.gm-menu,.ss-icon-btn')) setMenu(null) }}>
      <h1 className="ss-h1">Games</h1>
      {games.length > 0 && (
        <Seg name="gm-view" legend="Show" value={view} onChange={setView}
          options={[{ v: 'games', label: 'Games' }, { v: 'season', label: 'Full season' }]} />
      )}
      {games.length === 0 && (
        <section className="gm-empty">
          <EmptyArt />
          <h2>No games yet</h2>
          <p>Add your next game and you're ready to start tracking from the sideline.</p>
          <Link to="/games/new" className="ss-btn ss-btn-primary ss-btn-big">Add your first game</Link>
        </section>
      )}
      {view === 'season' && games.length > 0 && <SeasonSchedule games={games} card={card} />}
      {view === 'games' && live.map((g) => {
        const n = heartsFor(thanks, g.id).length
        return (
        <section key={g.id} className="gm-live" aria-label="Live game">
          <div className="ss-eyebrow"><span className="gm-pulse" aria-hidden="true" /> Live now</div>
          <div className="gm-live-title">{g.home ? 'vs' : '@'} {g.opponent}</div>
          <div className="gm-live-sub">{whenOf(g)} · {g.home ? 'Home' : 'Away'}{n > 0 && <> · <ThanksTag n={n} /></>}</div>
          <Link to={`/games/${g.id}/track`} className="ss-btn ss-btn-big">Continue tracking</Link>
        </section>
        )
      })}
      {view === 'games' && upcoming.length > 0 && <><h2 className="ss-h2">Upcoming</h2><ul className="gm-list">{upcoming.map(card)}</ul></>}
      {view === 'games' && final.length > 0 && <><h2 className="ss-h2">Final</h2><ul className="gm-list">{final.map(card)}</ul></>}
      {games.length > 0 && <Link to="/games/new" className="ss-fab" aria-label="New game"><span aria-hidden="true">＋</span> New game</Link>}

      {/* On the shared Sheet, which is drawn on the body: inside the page it sat under the tab bar and its buttons were off screen. */}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Delete this game?">
        {(close) => confirm && (
          <>
            <p className="ss-hint">{confirm.opponent} on {fmtDate(confirm.date)} and all its stats will be removed for everyone.</p>
            <div className="ss-row">
              <button className="ss-btn" onClick={close}>Cancel</button>
              <button className="ss-btn ss-btn-danger" onClick={async () => { const g = confirm; close(); await repo.deleteGame(g.id); void load() }}>Delete</button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  )
}
