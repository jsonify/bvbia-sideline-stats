import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRepo } from '../../data/context'
import type { GameLanes, SyncState } from '../../data/repository'
import type { BallType, Game, NewStatEvent, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { LANES, LANE_OF, ROLE_LANES, lanesText, roleOf, type Lane, type Role } from '../../lib/lanes'
import { eventLabel } from './labels'

const byTime = (a: StatEvent, b: StatEvent) => a.createdAt.localeCompare(b.createdAt)

/** How often the tracking phone renews its lease (the server frees it after 2 minutes of silence). */
export const LEASE_TICK_MS = 15_000
/** Never make a parent wait on a bad connection before they can tap: past this, assume they're the tracker. */
export const CLAIM_WAIT_MS = 3_000

const periodName = (n: number) => (n === 1 ? '1st half' : '2nd half')

export function haptic(ms: number | number[] = 12) {
  try { navigator.vibrate?.(ms) } catch { /* unsupported */ }
}

export function useTracker(gameId: string) {
  const repo = useRepo()
  const [game, setGame] = useState<Game | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [events, setEvents] = useState<StatEvent[]>([])
  const [period, setPeriodState] = useState(1)
  const [ballType, setBallType] = useState<BallType>('through_ball')
  const [sync, setSync] = useState<{ state: SyncState; pending: number }>({ state: 'synced', pending: 0 })
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null)
  const [held, setHeldState] = useState<Lane[]>([]) // the lanes this phone may tap: none = watching
  const [checking, setCheckingState] = useState(true) // still waiting for the server's first answer
  const [lanes, setLanes] = useState<GameLanes | null>(null) // who holds each lane, as the server last said
  const [lost, setLost] = useState<Lane[]>([]) // lanes we were tracking and someone took over
  const heldRef = useRef<Lane[]>([])
  const checkingRef = useRef(true)
  const confirmed = useRef(new Set<Lane>()) // lanes the server has told us we hold (as opposed to assuming so while offline)
  const periodRef = useRef(1)
  const topPeriod = useRef(0) // the latest half anyone has recorded in
  const firstLoad = useRef(true)
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

  const choosePeriod = useCallback((n: number) => { periodRef.current = n; setPeriodState(n) }, [])

  const refresh = useCallback(async () => {
    const list = await repo.listEvents(gameId)
    const merged = [...list.filter((e) => !e.deletedAt && !removed.current.has(e.id)), ...temps.current.values()]
    setEvents(merged.sort(byTime))
    // Each phone has its own half switch, so a phone that joins late (or reopens the game) starts in the half the game is
    // in, and one that sees another phone record in a later half moves up with it. It can still go back by hand.
    const top = merged.reduce((m, e) => Math.max(m, e.period), 0)
    if (top > topPeriod.current) {
      topPeriod.current = top
      if (top > periodRef.current) {
        choosePeriod(top)
        if (!firstLoad.current) say(`Moved to the ${periodName(top)}: another phone is recording there`)
      }
    }
    firstLoad.current = false
  }, [repo, gameId, choosePeriod, say])

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

  const setHeld = useCallback((l: Lane[]) => { heldRef.current = l; setHeldState(l) }, [])
  const setChecking = useCallback((c: boolean) => { checkingRef.current = c; setCheckingState(c) }, [])

  // --- one tracker per lane ---------------------------------------------------------------------------
  // Two parents tapping the same play would double-count it, so a lane has one tracker: a phone can hold both lanes
  // (tracking everything) or the phones can split them (defense on one, offense on another).
  // The lease is coordination, not security: if the server can't be reached we assume we hold the lanes,
  // so a bad signal never stops a parent from recording the game.
  const isFinal = game?.status === 'final'
  const active = loaded && !!game && !isFinal

  /** Take the server's word for who holds what. Returns the lanes we hold that nobody holds any more, to renew at once. */
  const applyLanes = useCallback((v: GameLanes): Lane[] => {
    const prev = heldRef.current
    const next: Lane[] = []
    const gone: Lane[] = []
    const lapsed: Lane[] = []
    for (const l of LANES) {
      if (v[l].holder === 'me') { next.push(l); confirmed.current.add(l) }
      else if (prev.includes(l)) {
        if (v[l].holder === 'none') { next.push(l); lapsed.push(l) } // our lease lapsed but nobody took it: keep it, renew now
        else gone.push(l)
      }
    }
    if (gone.length) {
      // Only "took over" if we really had it; if we were just assuming (offline), someone was already there.
      const took = gone.filter((l) => confirmed.current.has(l))
      const already = gone.filter((l) => !confirmed.current.has(l))
      const who = (ls: Lane[]) => { const n = [...new Set(ls.map((l) => v[l].name || 'Another parent'))]; return n.length === 1 ? n[0] : 'Other parents' }
      const said: string[] = []
      if (took.length) { setLost((p) => [...new Set([...p, ...took])]); said.push(`${who(took)} took over ${lanesText(took)}`) }
      if (already.length) said.push(`${who(already)} is already tracking ${lanesText(already)}`)
      say(said.join('. '))
      for (const l of gone) confirmed.current.delete(l)
    }
    setHeld(next)
    setLanes(v)
    setChecking(false)
    if (next.length) setLost((p) => (p.some((l) => next.includes(l)) ? p.filter((l) => !next.includes(l)) : p))
    return lapsed
  }, [setHeld, setChecking, say])

  /** Ask the server. With lanes, renew/start our lease on them; with null, only look. Failures keep what we already know. */
  const check = useCallback(async (claim: Lane[] | null) => {
    const seq = ++trackSeq.current
    try {
      const v = claim ? await repo.claimLanes(gameId, claim) : await repo.getLanes(gameId)
      if (seq !== trackSeq.current) return // a newer answer already arrived
      const lapsed = applyLanes(v)
      if (lapsed.length) void check(lapsed)
    } catch {
      if (checkingRef.current) { setHeld([...LANES]); setChecking(false) } // offline / migration not run: carry on tracking
    }
  }, [repo, gameId, applyLanes, setHeld, setChecking])

  useEffect(() => {
    if (!active) return
    void check([...LANES]) // opening a game picks up every lane nobody holds; a lone parent ends up tracking everything
    const giveUp = setTimeout(() => { if (checkingRef.current) { setHeld([...LANES]); setChecking(false) } }, CLAIM_WAIT_MS)
    const tick = () => void check(heldRef.current.length ? heldRef.current : null)
    const timer = setInterval(tick, LEASE_TICK_MS)
    const nudge = repo.onTrackerChange(() => void check(null)) // never claim from a nudge: our own claim would echo back forever
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const release = () => { if (heldRef.current.length) void repo.releaseLanes(gameId, heldRef.current) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', release)
    return () => {
      clearTimeout(giveUp); clearInterval(timer); nudge()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', release)
      release() // leaving the screen hands the lanes back straight away
      trackSeq.current++
      confirmed.current.clear()
      setHeld([])
      setChecking(true)
      setLanes(null)
    }
  }, [active, repo, gameId, check, setHeld, setChecking])

  /**
   * Change what this phone tracks. Lanes it drops are handed back at once; lanes it adds are claimed, and only
   * taken from someone who is actively tracking them when `takeOver` is set (the screen asks first).
   */
  const pickRole = useCallback(async (role: Role, takeOver = false) => {
    const target = ROLE_LANES[role]
    const cur = heldRef.current
    const drop = cur.filter((l) => !target.includes(l))
    const add = target.filter((l) => !cur.includes(l))
    if (!drop.length && !add.length) return
    if (drop.length) {
      setHeld(cur.filter((l) => !drop.includes(l))) // their buttons go off straight away
      for (const l of drop) confirmed.current.delete(l)
      await repo.releaseLanes(gameId, drop)
    }
    if (!add.length) { void check(null); return }
    const seq = ++trackSeq.current
    try {
      const v = await repo.claimLanes(gameId, add, { takeOver })
      if (seq !== trackSeq.current) return
      applyLanes(v)
      const missed = add.filter((l) => v[l].holder !== 'me')
      if (!missed.length) say(`Now tracking ${lanesText(heldRef.current)}`)
      else say(`${v[missed[0]].name || 'Another parent'} just started tracking ${lanesText(missed)}`)
    } catch {
      say('Could not reach the server. Try again when you have signal.')
    }
  }, [repo, gameId, applyLanes, check, setHeld, say])

  /** Who would have to give a lane up for this phone to track `role`: lanes someone else is actively tracking. */
  const blockersFor = useCallback((role: Role) => LANES
    .filter((l) => ROLE_LANES[role].includes(l) && !held.includes(l) && lanes?.[l].holder === 'other')
    .map((l) => ({ lane: l, name: lanes![l].name, idleSeconds: lanes![l].idleSeconds })), [held, lanes])

  const canTap = useCallback((lane: Lane) => !isFinal && held.includes(lane), [isFinal, held])
  const canTrack = !isFinal && held.length > 0 // holding at least one lane
  const watching = !isFinal && !checking && held.length === 0 // someone else has the game (or nobody yet): view-only

  const summary = useMemo(() => summarize(events), [events])
  const periodSummary = useMemo(() => summarize(events.filter((e) => e.period === period)), [events, period])

  const setStatus = useCallback(async (status: Game['status']) => {
    if (!game || !heldRef.current.length) return
    const { id, teamId: _t, createdAt: _c, updatedAt: _u, ...rest } = game
    setGame({ ...game, status })
    try { setGame(await repo.saveGame({ ...rest, id, status })) } catch { setGame(game); say('Could not update game') }
  }, [game, repo, say])

  const record = useCallback((e: NewStatEvent) => {
    if (!game || game.status === 'final' || !held.includes(LANE_OF[e.category])) return
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
  }, [game, gameId, held, repo, setStatus, say])

  // Undo is for your own lanes: with two phones tapping, the newest tap overall may be the other phone's.
  const mine = useMemo(() => events.filter((e) => held.includes(LANE_OF[e.category])), [events, held])

  const undo = useCallback(async (ev?: StatEvent) => {
    const target = ev ?? mine[mine.length - 1]
    if (!target || !held.includes(LANE_OF[target.category])) return
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
  }, [mine, held, repo, say, refresh])

  const recordDuel = (outcome: 'won' | 'lost') => record({ gameId, category: 'duel', outcome, period })
  const recordContact = (outcome: 'clean' | 'miss') => record({ gameId, category: 'first_contact', outcome, ballType, period })
  const recordBox = (outcome: 'shot' | 'no_shot') => record({ gameId, category: 'box_entry', outcome, period })

  return {
    game, loaded, events, summary, periodSummary, period, setPeriod: choosePeriod, ballType, setBallType, sync, toast,
    checking, held, role: roleOf(held), lanes, lost, canTrack, canTap, watching, pickRole, blockersFor,
    recordDuel, recordContact, recordBox, undo, setStatus, last: mine[mine.length - 1] as StatEvent | undefined,
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
