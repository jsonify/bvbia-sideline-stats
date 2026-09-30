import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { LocalRepository } from './localRepository'
import { WriteQueue, PermanentError, type QueueOp, type QueueStore } from './queue'
import { summarize } from '../lib/summary'

let n = 0
const repo = () => new LocalRepository({ dbName: `t${n++}` })
const gameInput = { opponent: 'Hawks', date: '2026-09-01', home: true, periods: 2 as const, status: 'live' as const }

describe('LocalRepository (demo mode)', () => {
  it('creates and joins a team', async () => {
    const r = repo()
    expect(await r.getTeam()).toBeNull()
    const t = await r.createTeam(' Lions ')
    expect(t.name).toBe('Lions')
    expect(t.joinCode).toMatch(/^[A-Z0-9]{6}$/)
    expect((await r.getTeam())?.id).toBe(t.id)
    expect((await r.joinTeam(t.joinCode.toLowerCase())).id).toBe(t.id)
    await expect(r.joinTeam('NOPE22')).rejects.toThrow()
  })

  it('saves team branding and notifies subscribers', async () => {
    const r = repo()
    await expect(r.saveBranding({ accent: '#FDE100', appearance: 'dark' })).rejects.toThrow()
    await r.createTeam('BVB Fans')
    const cb = vi.fn()
    r.subscribe(cb)
    const b = { accent: '#E11D2A', appearance: 'light' as const, logo: 'data:image/png;base64,AAAA' }
    const t = await r.saveBranding(b)
    expect(t.branding).toEqual(b)
    expect((await r.getTeam())?.branding).toEqual(b)
    expect(cb).toHaveBeenCalled()
  })

  it('requires a team to save games', async () => {
    await expect(repo().saveGame(gameInput)).rejects.toThrow()
  })

  it('saves, updates and deletes games', async () => {
    const r = repo()
    const t = await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    expect(g.teamId).toBe(t.id)
    const g2 = await r.saveGame({ ...gameInput, id: g.id, status: 'final' })
    expect(g2.createdAt).toBe(g.createdAt)
    expect((await r.getGame(g.id))?.status).toBe('final')
    expect(await r.listGames()).toHaveLength(1)
    await r.deleteGame(g.id)
    expect(await r.listGames()).toHaveLength(0)
    expect(await r.getGame(g.id)).toBeNull()
  })

  it('adds events, undoes them, and feeds summarize', async () => {
    const r = repo()
    await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    const cb = vi.fn()
    r.subscribe(cb)
    await r.addEvent(g.id, { gameId: g.id, category: 'duel', outcome: 'won', period: 1 })
    const lost = await r.addEvent(g.id, { gameId: g.id, category: 'duel', outcome: 'lost', period: 1 })
    await r.addEvent(g.id, { gameId: g.id, category: 'first_contact', outcome: 'clean', ballType: 'long_ball', period: 2 })
    expect(cb).toHaveBeenCalledTimes(3)
    expect(summarize(await r.listEvents(g.id)).duels.total).toBe(2)
    await r.undoEvent(lost.id)
    const s = summarize(await r.listAllEvents())
    expect(s.duels).toMatchObject({ won: 1, lost: 0 })
    expect(s.firstContact.longBall.clean).toBe(1)
  })

  it('reports synced sync state', async () => {
    const r = repo()
    const cb = vi.fn()
    r.onSyncState(cb)
    expect(cb).toHaveBeenCalledWith('synced', 0)
  })
})

function memStore(): QueueStore & { items: Map<number, QueueOp> } {
  let k = 0
  const items = new Map<number, QueueOp>()
  return {
    items,
    async all() { return [...items].map(([key, op]) => ({ key, op })) },
    async add(op) { items.set(++k, op) },
    async remove(key) { items.delete(key) },
  }
}
const op = (id: string): QueueOp => ({ table: 'stat_events', row: { id } })

describe('WriteQueue', () => {
  it('flushes in order and reports synced', async () => {
    const store = memStore()
    const sent: string[] = []
    const q = new WriteQueue({ store, send: async (o) => { sent.push(o.row.id as string) }, isOnline: () => true })
    const states: string[] = []
    q.onState((s) => states.push(s))
    await q.enqueue(op('a')); await q.enqueue(op('b'))
    await q.flush()
    expect(sent).toEqual(['a', 'b'])
    expect(store.items.size).toBe(0)
    expect(states.at(-1)).toBe('synced')
  })

  it('stays offline without sending, then flushes on kick', async () => {
    const store = memStore()
    let online = false
    const send = vi.fn(async () => {})
    const q = new WriteQueue({ store, send, isOnline: () => online })
    let last: [string, number] = ['', -1]
    q.onState((s, p) => (last = [s, p]))
    await q.enqueue(op('a')); await q.flush()
    expect(send).not.toHaveBeenCalled()
    expect(last).toEqual(['offline', 1])
    online = true
    q.kick(); await q.flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(last).toEqual(['synced', 0])
  })

  it('retries with exponential backoff', async () => {
    const store = memStore()
    const delays: number[] = []
    let timerFn: (() => void) | null = null
    let fails = 2
    const send = vi.fn(async () => { if (fails-- > 0) throw new Error('net') })
    const q = new WriteQueue({
      store, send, isOnline: () => true, baseDelayMs: 100,
      setTimer: (fn, ms) => { delays.push(ms); timerFn = fn; return 1 },
    })
    let last = ''
    q.onState((s) => (last = s))
    await q.enqueue(op('a')); await q.flush()
    expect(last).toBe('error'); expect(store.items.size).toBe(1)
    timerFn!(); await q.flush()
    timerFn!(); await q.flush()
    expect(delays).toEqual([100, 200])
    expect(store.items.size).toBe(0)
    expect(last).toBe('synced')
  })

  it('drops permanently failing ops so they do not block the queue', async () => {
    const store = memStore()
    const sent: string[] = []
    const q = new WriteQueue({
      store, isOnline: () => true,
      send: async (o) => { if (o.row.id === 'bad') throw new PermanentError('rls'); sent.push(o.row.id as string) },
    })
    let last = ''
    q.onState((s) => (last = s))
    await q.enqueue(op('bad')); await q.enqueue(op('good')); await q.flush()
    expect(sent).toEqual(['good'])
    expect(store.items.size).toBe(0)
    expect(last).toBe('error')
  })
})

// --- Two devices sharing one (fake) cloud ---------------------------------------------------------
import type { RemoteApi } from './remote'
import type { Team } from '../types'

function fakeCloud() {
  const teams = new Map<string, Team>()
  const games = new Map<string, any>()
  const events = new Map<string, any>()
  const api = (): RemoteApi => ({
    userId: async () => 'u',
    myTeam: async () => null,
    createTeam: async (name) => { const t = { id: crypto.randomUUID(), name, joinCode: 'JOIN22' }; teams.set(t.id, t); return t },
    joinTeam: async (code) => {
      const t = [...teams.values()].find((x) => x.joinCode === code)
      if (!t) throw new Error('No team found with that code')
      return t
    },
    saveBranding: async (id, branding) => { const t = { ...teams.get(id)!, branding }; teams.set(id, t); return t },
    push: async (op) => {
      const row = op.row as any
      const teamId = row.teamId
      if (!teams.has(teamId)) throw Object.assign(new Error('fk violation'), { permanent: true })
      ;(op.table === 'games' ? games : events).set(row.id, { ...row, teamId })
    },
    pull: async (teamId) => ({
      games: [...games.values()].filter((g) => g.teamId === teamId),
      events: [...events.values()].filter((e) => e.teamId === teamId),
    }),
    watch: () => () => {},
  })
  return { api, games, events }
}

describe('cloud sync across devices', () => {
  it('a second device joining by code sees the games and stats, including ones recorded before linking to the cloud', async () => {
    const cloud = fakeCloud()

    // Device A first used the app on this phone without a cloud connection (demo mode)...
    const demo = new LocalRepository({ dbName: 'devA' })
    await demo.createTeam('Old demo team')
    const early = await demo.saveGame(gameInput)
    await demo.addEvent(early.id, { gameId: early.id, category: 'duel', outcome: 'won', period: 1 } as any)

    // ...then the cloud was switched on and the team was created for real.
    const a = new LocalRepository({ dbName: 'devA', remote: cloud.api(), baseDelayMs: 1 })
    const team = await a.createTeam('BVB Fans')
    const later = await a.saveGame({ ...gameInput, opponent: 'Bayern' })
    await a.addEvent(later.id, { gameId: later.id, category: 'box_entry', outcome: 'shot', period: 1 } as any)

    await vi.waitFor(() => { expect(cloud.games.size).toBe(2); expect(cloud.events.size).toBe(2) })

    // Device B joins with the team code.
    const b = new LocalRepository({ dbName: 'devB', remote: cloud.api(), baseDelayMs: 1 })
    await b.joinTeam(team.joinCode)
    await vi.waitFor(async () => expect((await b.listGames()).map((g) => g.opponent).sort()).toEqual(['Bayern', 'Hawks']))
    expect(await b.listAllEvents()).toHaveLength(2)
  })
})
