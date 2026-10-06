import '../branding/branding.css'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepo } from '../../data/context'
import { useRemembered } from '../../data/remember'
import { heartsFor } from '../../lib/thanks'
import { summarize } from '../../lib/summary'
import { ThanksTag } from '../thanks/ThanksHeart'
import { useThanks } from '../thanks/useThanks'
import type { Game, StatSummary } from '../../types'
import '../shell/shell.css'
import './games.css'

const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const statusLabel = { scheduled: 'Upcoming', live: 'Live', final: 'Final' } as const

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

function GameCard({ g, s, hearts, open, onMenu, onDelete }: {
  g: Game; s?: StatSummary; hearts: number; open: boolean; onMenu: () => void; onDelete: () => void
}) {
  const to = g.status === 'live' ? `/games/${g.id}/track` : `/games/${g.id}`
  return (
    <li className="gm-card">
      <div className="ss-card">
        <Link to={to} className="ss-card-link">
          <div className="gm-opp">{g.home ? 'vs' : '@'} {g.opponent}</div>
          <div className="gm-meta">{fmtDate(g.date)} · {g.home ? 'Home' : 'Away'} · {statusLabel[g.status]}{g.location ? ` · ${g.location}` : ''}{hearts > 0 && <> · <ThanksTag n={hearts} /></>}</div>
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

export default function GamesPage() {
  const repo = useRepo()
  const [games, setGames] = useRemembered<Game[] | null>(repo, 'games', null)
  const [stats, setStats] = useRemembered<Record<string, StatSummary>>(repo, 'game-stats', {})
  const [menu, setMenu] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Game | null>(null)
  const thanks = useThanks()

  const load = useCallback(async () => {
    const list = await repo.listGames()
    setGames(list)
    const finals = list.filter((g) => g.status === 'final')
    const entries = await Promise.all(finals.map(async (g) => [g.id, summarize(await repo.listEvents(g.id))] as const))
    setStats(Object.fromEntries(entries))
  }, [repo, setGames, setStats])

  useEffect(() => { void load(); return repo.subscribe(() => void load()) }, [repo, load])

  if (!games) return <div className="ss-loading" role="status">Loading games…</div>

  const live = games.filter((g) => g.status === 'live')
  const upcoming = games.filter((g) => g.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))
  const final = games.filter((g) => g.status === 'final').sort((a, b) => b.date.localeCompare(a.date))
  const card = (g: Game) => (
    <GameCard key={g.id} g={g} s={stats[g.id]} hearts={heartsFor(thanks, g.id).length} open={menu === g.id}
      onMenu={() => setMenu(menu === g.id ? null : g.id)} onDelete={() => { setMenu(null); setConfirm(g) }} />
  )

  return (
    <main className="ss-page" onClick={(e) => { if (menu && !(e.target as HTMLElement).closest('.gm-menu,.ss-icon-btn')) setMenu(null) }}>
      <h1 className="ss-h1">Games</h1>
      {games.length === 0 && (
        <section className="gm-empty">
          <EmptyArt />
          <h2>No games yet</h2>
          <p>Add your next game and you're ready to start tracking from the sideline.</p>
          <Link to="/games/new" className="ss-btn ss-btn-primary ss-btn-big">Add your first game</Link>
        </section>
      )}
      {live.map((g) => {
        const n = heartsFor(thanks, g.id).length
        return (
        <section key={g.id} className="gm-live" aria-label="Live game">
          <div className="ss-eyebrow"><span className="gm-pulse" aria-hidden="true" /> Live now</div>
          <div className="gm-live-title">{g.home ? 'vs' : '@'} {g.opponent}</div>
          <div className="gm-live-sub">{fmtDate(g.date)} · {g.home ? 'Home' : 'Away'}{n > 0 && <> · <ThanksTag n={n} /></>}</div>
          <Link to={`/games/${g.id}/track`} className="ss-btn ss-btn-big">Continue tracking</Link>
        </section>
        )
      })}
      {upcoming.length > 0 && <><h2 className="ss-h2">Upcoming</h2><ul className="gm-list">{upcoming.map(card)}</ul></>}
      {final.length > 0 && <><h2 className="ss-h2">Final</h2><ul className="gm-list">{final.map(card)}</ul></>}
      {games.length > 0 && <Link to="/games/new" className="ss-fab" aria-label="New game"><span aria-hidden="true">＋</span> New game</Link>}

      {confirm && (
        <div className="gm-sheet-bg" onClick={() => setConfirm(null)}>
          <div className="gm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="del-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="del-t">Delete this game?</h2>
            <p className="ss-hint">{confirm.opponent} on {fmtDate(confirm.date)} and all its stats will be removed for everyone.</p>
            <div className="ss-row" style={{ marginTop: 12 }}>
              <button className="ss-btn" autoFocus onClick={() => setConfirm(null)}>Cancel</button>
              <button className="ss-btn ss-btn-danger" onClick={async () => { const g = confirm; setConfirm(null); await repo.deleteGame(g.id); void load() }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
