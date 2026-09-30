import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRepo } from '../../data/context'
import type { SyncState } from '../../data/repository'
import type { BallType, Game, NewStatEvent, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { eventLabel } from './labels'

const byTime = (a: StatEvent, b: StatEvent) => a.createdAt.localeCompare(b.createdAt)

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
    repo.getGame(gameId).then((g) => { if (alive) { setGame(g); setLoaded(true) } })
    refresh()
    const un1 = repo.subscribe(() => { if (alive) refresh() })
    const un2 = repo.onSyncState((state, n) => setSync({ state, pending: n }))
    return () => { alive = false; un1(); un2() }
  }, [repo, gameId, refresh])

  const summary = useMemo(() => summarize(events), [events])
  const periodSummary = useMemo(() => summarize(events.filter((e) => e.period === period)), [events, period])

  const setStatus = useCallback(async (status: Game['status']) => {
    if (!game) return
    const { id, teamId: _t, createdAt: _c, updatedAt: _u, ...rest } = game
    setGame({ ...game, status })
    try { setGame(await repo.saveGame({ ...rest, id, status })) } catch { setGame(game); say('Could not update game') }
  }, [game, repo, say])

  const record = useCallback((e: NewStatEvent) => {
    if (!game || game.status === 'final') return
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
  }, [game, gameId, repo, setStatus, say])

  const undo = useCallback(async (ev?: StatEvent) => {
    const target = ev ?? events[events.length - 1]
    if (!target) return
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
  }, [events, repo, say, refresh])

  const recordDuel = (outcome: 'won' | 'lost') => record({ gameId, category: 'duel', outcome, period })
  const recordContact = (outcome: 'clean' | 'miss') => record({ gameId, category: 'first_contact', outcome, ballType, period })
  const recordBox = (outcome: 'shot' | 'no_shot') => record({ gameId, category: 'box_entry', outcome, period })

  return {
    game, loaded, events, summary, periodSummary, period, setPeriod, ballType, setBallType, sync, toast,
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
