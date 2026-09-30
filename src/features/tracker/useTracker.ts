import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRepo } from '../../data/context'
import type { GameTracker, SyncState } from '../../data/repository'
import type { BallType, Game, NewStatEvent, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { eventLabel } from './labels'

const byTime = (a: StatEvent, b: StatEvent) => a.createdAt.localeCompare(b.createdAt)

/** How often the tracking phone renews its lease (the server frees it after 2 minutes of silence). */
export const LEASE_TICK_MS = 15_000
/** Never make a parent wait on a bad connection before they can tap: past this, assume they're the tracker. */
export const CLAIM_WAIT_MS = 3_000

/** checking: asking the server · tracker: you can tap · viewer: someone else tracks (or nobody yet), you watch live */
export type TrackRole = 'checking' | 'tracker' | 'viewer'

export function haptic(ms: number | number[] = 12) {
  try { navigator.vibrate?.(ms) } catch { /* unsupported */ }
}

export function useTracker(gameId: string) {
  const repo = useRepo()
  const [game, setGame] = useState<Game | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [events, setEvents] = useState<StatEvent[]>([])
  const [period, setPeriod] = useState(1)
  const [ballType, setBallType] = useState<BallType>('through_ball')
  const [sync, setSync] = useState<{ state: SyncState; pending: number }>({ state: 'synced', pending: 0 })
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null)
  const [role, setRoleState] = useState<TrackRole>('checking')
  const [other, setOther] = useState<GameTracker | null>(null) // what we know about the tracker when we're only watching
  const [lost, setLost] = useState(false) // we were tracking and someone took over
  const roleRef = useRef<TrackRole>('checking')
  const confirmed = useRef(false) // the server has told us we hold the game (as opposed to assuming so while offline)
  const trackSeq = useRef(0)
  const pending = useRef(new Map<string, Promise<StatEvent | null>>())
  const temps = useRef(new Map<string, StatEvent>())
  const removed = useRef(new Set<string>())
  const seq = useRef(0)

  const say = useCallback((msg: string) => setToast({ msg, key: ++seq.current }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const refresh = useCallback(async () => {
    const list = await repo.listEvents(gameId)
    const merged = [...list.filter((e) => !e.deletedAt && !removed.current.has(e.id)), ...temps.current.values()]
    setEvents(merged.sort(byTime))
  }, [repo, gameId])

  useEffect(() => {
    let alive = true
    // Reload the game too, not just its events: a parent who is only watching must see it go live, and see it end.
    const loadGame = () => repo.getGame(gameId).then((g) => { if (alive) { setGame(g); setLoaded(true) } })
    void loadGame()
    refresh()
    const un1 = repo.subscribe(() => { if (alive) { void loadGame(); refresh() } })
    const un2 = repo.onSyncState((state, n) => setSync({ state, pending: n }))
    return () => { alive = false; un1(); un2() }
  }, [repo, gameId, refresh])

  const setRole = useCallback((r: TrackRole) => { roleRef.current = r; setRoleState(r) }, [])

  // --- one tracker per game -------------------------------------------------------------------------
  // Two parents tapping the same play would double-count it, so only the tracker's taps are accepted here.
  // The lease is coordination, not security: if the server can't be reached we assume we're the tracker,
  // so a bad signal never stops a parent from recording the game.
  const isFinal = game?.status === 'final'
  const active = loaded && !!game && !isFinal

  const applyTracker = useCallback((t: GameTracker) => {
    if (t.holder === 'me') { confirmed.current = true; setRole('tracker'); setOther(null); setLost(false); return }
    if (t.holder === 'none' && roleRef.current === 'tracker') return // our lease lapsed but nobody took it: the next check-in renews it
    if (roleRef.current === 'tracker') {
      // Only "took over" if we really had it; if we were just assuming (offline), someone was already there.
      if (confirmed.current) { setLost(true); say('Another parent took over tracking') }
      else say('Another parent is already tracking this game')
    }
    confirmed.current = false
    setRole('viewer'); setOther(t)
  }, [setRole, say])

  /** Ask the server. `claim` renews/starts our lease, `peek` only looks. Failures keep whatever we already know. */
  const check = useCallback(async (mode: 'claim' | 'peek') => {
    const seq = ++trackSeq.current
    try {
      const t = mode === 'claim' ? await repo.claimTracker(gameId) : await repo.getTracker(gameId)
      if (seq !== trackSeq.current) return // a newer answer already arrived
      if (t.holder === 'none' && roleRef.current === 'tracker') void check('claim')
      else applyTracker(t)
    } catch {
      if (roleRef.current === 'checking') setRole('tracker') // offline / migration not run: carry on tracking
    }
  }, [repo, gameId, applyTracker, setRole])

  useEffect(() => {
    if (!active) return
    void check('claim')
    const giveUp = setTimeout(() => { if (roleRef.current === 'checking') setRole('tracker') }, CLAIM_WAIT_MS)
    const tick = () => void check(roleRef.current === 'tracker' ? 'claim' : 'peek')
    const timer = setInterval(tick, LEASE_TICK_MS)
    const nudge = repo.onTrackerChange(() => void check('peek')) // never claim from a nudge: our own claim would echo back forever
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const release = () => { if (roleRef.current === 'tracker') void repo.releaseTracker(gameId) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', release)
    return () => {
      clearTimeout(giveUp); clearInterval(timer); nudge()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', release)
      release() // leaving the screen hands the game back straight away
      trackSeq.current++
      confirmed.current = false
      setRole('checking')
    }
  }, [active, repo, gameId, check, setRole])

  /** Take the game (`takeOver`: even though someone else is tracking it right now). */
  const startTracking = useCallback(async (takeOver = false) => {
    const seq = ++trackSeq.current
    try {
      const t = await repo.claimTracker(gameId, { takeOver })
      if (seq !== trackSeq.current) return
      applyTracker(t)
      if (t.holder === 'me') say('You are tracking now')
      else say('Another parent just started tracking')
    } catch {
      say('Could not reach the server. Try again when you have signal.')
    }
  }, [repo, gameId, applyTracker, say])

  const canTrack = role === 'tracker' && !isFinal
  const watching = role === 'viewer' && !isFinal // someone else has the game (or nobody yet): view-only

  const summary = useMemo(() => summarize(events), [events])
  const periodSummary = useMemo(() => summarize(events.filter((e) => e.period === period)), [events, period])

  const setStatus = useCallback(async (status: Game['status']) => {
    if (!game || role !== 'tracker') return
    const { id, teamId: _t, createdAt: _c, updatedAt: _u, ...rest } = game
    setGame({ ...game, status })
    try { setGame(await repo.saveGame({ ...rest, id, status })) } catch { setGame(game); say('Could not update game') }
  }, [game, role, repo, say])

  const record = useCallback((e: NewStatEvent) => {
    if (!game || game.status === 'final' || !canTrack) return
    haptic(12)
    if (game.status === 'scheduled') void setStatus('live')
    const tmpId = `tmp-${++seq.current}-${Math.random().toString(36).slice(2)}`
    const temp = { ...e, id: tmpId, gameId, createdAt: new Date().toISOString() } as StatEvent
    temps.current.set(tmpId, temp)
    setEvents((prev) => [...prev, temp].sort(byTime))
    const p = repo.addEvent(gameId, e).then(
      (real) => {
        temps.current.delete(tmpId)
        setEvents((prev) => prev.map((x) => (x.id === tmpId ? real : x)))
        return real
      },
      () => {
        temps.current.delete(tmpId)
        setEvents((prev) => prev.filter((x) => x.id !== tmpId))
        say('Tap failed, try again')
        return null
      },
    ).finally(() => pending.current.delete(tmpId))
    pending.current.set(tmpId, p)
  }, [game, gameId, canTrack, repo, setStatus, say])

  const undo = useCallback(async (ev?: StatEvent) => {
    const target = ev ?? events[events.length - 1]
    if (!target || role === 'viewer') return
    haptic([8, 30, 8])
    setEvents((prev) => prev.filter((x) => x.id !== target.id))
    say(`Undid ${eventLabel(target)}`)
    let realId: string | undefined = target.id
    if (target.id.startsWith('tmp-')) {
      const real = await pending.current.get(target.id)
      realId = real?.id
    }
    if (!realId) return
    removed.current.add(realId)
    try { await repo.undoEvent(realId) } catch { removed.current.delete(realId); say('Undo failed'); refresh() }
  }, [events, role, repo, say, refresh])

  const recordDuel = (outcome: 'won' | 'lost') => record({ gameId, category: 'duel', outcome, period })
  const recordContact = (outcome: 'clean' | 'miss') => record({ gameId, category: 'first_contact', outcome, ballType, period })
  const recordBox = (outcome: 'shot' | 'no_shot') => record({ gameId, category: 'box_entry', outcome, period })

  return {
    game, loaded, events, summary, periodSummary, period, setPeriod, ballType, setBallType, sync, toast,
    role, canTrack, watching, other, lost, startTracking,
    recordDuel, recordContact, recordBox, undo, setStatus, last: events[events.length - 1] as StatEvent | undefined,
  }
}

/** Keep the screen awake while mounted. */
export function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    let dead = false
    const acquire = async () => {
      try {
        const wl = (navigator as any).wakeLock
        if (wl && document.visibilityState === 'visible') {
          const l = await wl.request('screen')
          if (dead) l.release().catch(() => {}); else lock = l
        }
      } catch { /* denied */ }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => { dead = true; document.removeEventListener('visibilitychange', acquire); lock?.release().catch(() => {}) }
  }, [])
}
