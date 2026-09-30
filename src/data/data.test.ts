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
    await expect(r.saveBranding({ accent: '#FFD900', appearance: 'dark' })).rejects.toThrow()
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
  let codes = 0
  // Tracking leases: same rules as supabase/migrations/0003_game_tracker.sql (120 s lease, take over, release).
  const LEASE = 120
  const leases = new Map<string, { user: string | null; seenAt: number; name: string | null }>()
  const trackerWatchers = new Set<() => void>()
  const clock = { now: 0, down: false }
  const ping = () => trackerWatchers.forEach((f) => f())
  const reach = () => { if (clock.down) throw new Error('Failed to fetch') }
  const view = (gameId: string, me: string) => {
    const l = leases.get(gameId)
    if (!l || !l.user) return { holder: 'none' as const, idleSeconds: null, name: null }
    const idle = clock.now - l.seenAt
    return { holder: l.user === me ? ('me' as const) : idle > LEASE ? ('none' as const) : ('other' as const), idleSeconds: idle, name: l.name }
  }
  const api = (user = 'u'): RemoteApi => ({
    getTracker: async (id) => { reach(); return view(id, user) },
    claimTracker: async (id, takeOver, name) => {
      reach()
      const l = leases.get(id)
      if (takeOver || !l || !l.user || l.user === user || clock.now - l.seenAt > LEASE) { leases.set(id, { user, seenAt: clock.now, name: name || null }); ping() }
      return view(id, user)
    },
    releaseTracker: async (id) => {
      reach()
      if (leases.get(id)?.user === user) { leases.set(id, { user: null, seenAt: clock.now, name: null }); ping() }
    },
    watchTrackers: (_team, cb) => { trackerWatchers.add(cb); return () => { trackerWatchers.delete(cb) } },
    userId: async () => user,
    myTeams: async () => [...teams.values()],
    createTeam: async (name) => { const t = { id: crypto.randomUUID(), name, joinCode: `CODE${++codes}` }; teams.set(t.id, t); return t },
    joinTeam: async (code) => {
      const t = [...teams.values()].find((x) => x.joinCode === code)
      if (!t) throw new Error('No team found with that code')
      return t
    },
    saveBranding: async (id, branding) => { const t = { ...teams.get(id)!, branding }; teams.set(id, t); return t },
    push: async (op) => {
      const row = op.row as any
      if (!teams.has(row.teamId)) throw Object.assign(new Error('fk violation'), { permanent: true })
      ;(op.table === 'games' ? games : events).set(row.id, { ...row })
    },
    pull: async (teamId) => ({
      games: [...games.values()].filter((g) => g.teamId === teamId),
      events: [...events.values()].filter((e) => e.teamId === teamId),
    }),
    watch: () => () => {},
  })
  return { api, games, events, teams, clock, trackerWatchers }
}
const ev = (gameId: string, category = 'duel', outcome = 'won') => ({ gameId, category, outcome, period: 1 }) as any

describe('cloud sync across devices', () => {
  it('a second device joining by code sees the team\'s games and stats', async () => {
    const cloud = fakeCloud()
    const a = new LocalRepository({ dbName: 'cA', remote: cloud.api(), baseDelayMs: 1 })
    const team = await a.createTeam('BVB Fans')
    const g = await a.saveGame({ ...gameInput, opponent: 'Bayern' })
    await a.addEvent(g.id, ev(g.id, 'box_entry', 'shot'))
    await vi.waitFor(() => { expect(cloud.games.size).toBe(1); expect(cloud.events.size).toBe(1) })

    const b = new LocalRepository({ dbName: 'cB', remote: cloud.api(), baseDelayMs: 1 })
    await b.joinTeam(team.joinCode)
    await vi.waitFor(async () => expect((await b.listGames()).map((x) => x.opponent)).toEqual(['Bayern']))
    expect(await b.listAllEvents()).toHaveLength(1)
  })

  it('moves a team created before the cloud was configured into the cloud, with its games', async () => {
    const cloud = fakeCloud()
    const demo = new LocalRepository({ dbName: 'cD' })
    await demo.createTeam('Old demo team')
    const early = await demo.saveGame(gameInput)
    await demo.addEvent(early.id, ev(early.id))

    const linked = new LocalRepository({ dbName: 'cD', remote: cloud.api(), baseDelayMs: 1 })
    await vi.waitFor(() => { expect(cloud.teams.size).toBe(1); expect(cloud.games.size).toBe(1); expect(cloud.events.size).toBe(1) })
    const cloudTeam = [...cloud.teams.values()][0]
    expect(cloudTeam.name).toBe('Old demo team')
    expect((await linked.listGames()).map((g) => g.id)).toEqual([early.id])
    expect([...cloud.games.values()][0].teamId).toBe(cloudTeam.id)
  })
})

describe('multiple teams on one device', () => {
  it('keeps each team\'s games and season stats separate and switches between them', async () => {
    const r = repo()
    const a = await r.createTeam('U10 Thunder')
    const ga = await r.saveGame({ ...gameInput, opponent: 'Hawks' })
    await r.addEvent(ga.id, ev(ga.id))

    const b = await r.createTeam('U12 Lightning') // becomes active
    expect((await r.getTeam())?.id).toBe(b.id)
    expect(await r.listGames()).toEqual([])
    expect(await r.listAllEvents()).toEqual([])
    expect(await r.getGame(ga.id)).toBeNull() // other team's game is not reachable
    const gb = await r.saveGame({ ...gameInput, opponent: 'Owls' })
    await r.addEvent(gb.id, ev(gb.id, 'duel', 'lost'))
    expect((await r.listAllEvents()).map((e) => e.outcome)).toEqual(['lost'])

    expect((await r.listTeams()).map((t) => t.name)).toEqual(['U10 Thunder', 'U12 Lightning'])
    await r.switchTeam(a.id)
    expect((await r.listGames()).map((g) => g.opponent)).toEqual(['Hawks'])
    expect((await r.listAllEvents()).map((e) => e.outcome)).toEqual(['won'])
    await expect(r.switchTeam('nope')).rejects.toThrow()
  })

  it('keeps branding per team', async () => {
    const r = repo()
    const a = await r.createTeam('A')
    await r.saveBranding({ accent: '#E11D2A', appearance: 'dark' })
    const b = await r.createTeam('B')
    expect((await r.getTeam())?.branding).toBeUndefined()
    await r.switchTeam(a.id)
    expect((await r.getTeam())?.branding?.accent).toBe('#E11D2A')
    expect(b.id).not.toBe(a.id)
  })

  it('removes a team from the device, falls back to another, and can re-join with the code', async () => {
    const cloud = fakeCloud()
    const r = new LocalRepository({ dbName: 'multi', remote: cloud.api(), baseDelayMs: 1 })
    const a = await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    await r.addEvent(g.id, ev(g.id))
    const b = await r.createTeam('B')
    await vi.waitFor(() => expect(cloud.games.size).toBe(1))
    await new Promise((res) => setTimeout(res, 20)) // let the queue drain

    await r.leaveTeam(b.id)
    expect((await r.listTeams()).map((t) => t.id)).toEqual([a.id])
    expect((await r.getTeam())?.id).toBe(a.id) // fell back to the remaining team
    await r.leaveTeam(a.id)
    expect(await r.getTeam()).toBeNull()
    expect(await r.listTeams()).toEqual([])

    await r.joinTeam(a.joinCode) // cloud data comes back
    await vi.waitFor(async () => expect((await r.listGames()).map((x) => x.opponent)).toEqual([gameInput.opponent]))
    expect(await r.listAllEvents()).toHaveLength(1)
  })

  it('joining a team you already have just switches to it', async () => {
    const r = repo()
    const a = await r.createTeam('A')
    await r.createTeam('B')
    expect((await r.joinTeam(a.joinCode)).id).toBe(a.id)
    expect((await r.getTeam())?.id).toBe(a.id)
    expect(await r.listTeams()).toHaveLength(2)
  })
})

describe('one tracker per game', () => {
  const setup = async () => {
    const cloud = fakeCloud()
    const a = new LocalRepository({ dbName: `lease-a${n++}`, remote: cloud.api('parent-a'), baseDelayMs: 1 })
    const team = await a.createTeam('Thunder')
    const game = await a.saveGame(gameInput)
    const b = new LocalRepository({ dbName: `lease-b${n++}`, remote: cloud.api('parent-b'), baseDelayMs: 1 })
    await b.joinTeam(team.joinCode)
    return { cloud, a, b, id: game.id }
  }

  it('lets the first parent track and makes the second one watch', async () => {
    const { a, b, id } = await setup()
    expect(await a.claimTracker(id)).toMatchObject({ holder: 'me' })
    expect(await b.getTracker(id)).toMatchObject({ holder: 'other' })
    expect(await b.claimTracker(id)).toMatchObject({ holder: 'other' }) // cannot barge in
    expect(await a.claimTracker(id)).toMatchObject({ holder: 'me' }) // renewing is fine
  })

  it('a takeover switches who is tracking, and the old tracker finds out on their next check', async () => {
    const { a, b, id } = await setup()
    await a.claimTracker(id)
    expect(await b.claimTracker(id, { takeOver: true })).toMatchObject({ holder: 'me' })
    expect(await a.getTracker(id)).toMatchObject({ holder: 'other' })
    expect(await a.claimTracker(id)).toMatchObject({ holder: 'other' }) // heartbeat cannot steal it back
  })

  it('handing off frees the game straight away', async () => {
    const { a, b, id } = await setup()
    await a.claimTracker(id)
    await b.releaseTracker(id) // not the tracker: does nothing
    expect(await a.getTracker(id)).toMatchObject({ holder: 'me' })
    await a.releaseTracker(id)
    expect(await b.getTracker(id)).toEqual({ holder: 'none', idleSeconds: null, name: null })
    expect(await b.claimTracker(id)).toMatchObject({ holder: 'me' })
  })

  it('a tracker who goes quiet for over 2 minutes loses the game to whoever asks next', async () => {
    const { cloud, a, b, id } = await setup()
    await a.claimTracker(id)
    cloud.clock.now = 100
    expect(await b.claimTracker(id)).toMatchObject({ holder: 'other', idleSeconds: 100 })
    cloud.clock.now = 121
    expect(await b.getTracker(id)).toMatchObject({ holder: 'none' })
    expect(await a.getTracker(id)).toMatchObject({ holder: 'me' }) // still theirs until someone else takes it
    expect(await b.claimTracker(id)).toMatchObject({ holder: 'me' })
    expect(await a.claimTracker(id)).toMatchObject({ holder: 'other' })
  })

  it('tells the app when someone claims or releases, so a takeover shows up immediately', async () => {
    const { a, b, id } = await setup()
    const seen = vi.fn()
    const off = b.onTrackerChange(seen)
    await a.claimTracker(id)
    await a.releaseTracker(id)
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    await a.claimTracker(id)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('without a connection, claiming fails (so the app carries on tracking) but releasing never throws', async () => {
    const { cloud, a, id } = await setup()
    cloud.clock.down = true
    await expect(a.claimTracker(id)).rejects.toThrow()
    await expect(a.getTracker(id)).rejects.toThrow()
    await expect(a.releaseTracker(id)).resolves.toBeUndefined()
  })

  it("sends this device's name with every claim so the other parent can see who is tracking", async () => {
    const { a, b, id } = await setup()
    expect(await a.getDisplayName()).toBe('')
    await a.setDisplayName('  Sam  ')
    expect(await a.getDisplayName()).toBe('Sam')
    await a.claimTracker(id)
    expect(await b.getTracker(id)).toMatchObject({ holder: 'other', name: 'Sam' })
    await b.setDisplayName('Priya')
    expect(await b.claimTracker(id)).toMatchObject({ holder: 'other', name: 'Sam' }) // blocked: Sam still shown
    expect(await b.claimTracker(id, { takeOver: true })).toMatchObject({ holder: 'me', name: 'Priya' })
    expect(await a.getTracker(id)).toMatchObject({ holder: 'other', name: 'Priya' })
    await a.setDisplayName('x'.repeat(50))
    expect((await a.getDisplayName()).length).toBe(30)
  })

  it('a parent with no name set shows as unnamed', async () => {
    const { a, b, id } = await setup()
    await a.claimTracker(id)
    expect((await b.getTracker(id)).name).toBeNull()
  })

  it('demo mode is one device: the game is always yours', async () => {
    const r = repo()
    await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    expect(await r.claimTracker(g.id)).toMatchObject({ holder: 'me' })
    expect(await r.getTracker(g.id)).toEqual({ holder: 'none', idleSeconds: null, name: null })
    await expect(r.releaseTracker(g.id)).resolves.toBeUndefined()
  })

  it('never blocks stat events: taps a parent made while someone else was tracking still sync', async () => {
    const { cloud, a, b, id } = await setup()
    await a.claimTracker(id)
    await vi.waitFor(async () => expect((await b.listGames()).length).toBe(1))
    await b.addEvent(id, ev(id)) // b is only watching, but the data layer stays append-only and lossless
    await vi.waitFor(() => expect(cloud.events.size).toBe(1))
  })
})
