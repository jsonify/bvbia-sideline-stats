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
import type { GameLanes, GameThanks } from './repository'
import type { Lane } from '../lib/lanes'
import type { Team } from '../types'

function fakeCloud() {
  const teams = new Map<string, Team>()
  const games = new Map<string, any>()
  const events = new Map<string, any>()
  let codes = 0
  let stamp = Date.UTC(2026, 0, 1)
  // Tracking leases, one per lane: same rules as supabase/migrations/0005_tracker_lanes.sql (120 s lease, take over, release).
  const LEASE = 120
  const leases = new Map<string, { user: string | null; seenAt: number; name: string | null }>()
  const trackerWatchers = new Set<() => void>()
  // Hearts, same rules as supabase/migrations/0006_game_thanks.sql: one per parent per game, only on a started game, taking back is a soft delete.
  const thanks = new Map<string, { gameId: string; user: string; name: string | null; createdAt: string; deleted: boolean }>()
  const thanksWatchers = new Set<() => void>()
  const thanksGates = new Map<string, Promise<void>>() // holds the next heart a parent sends until the test lets it through
  const clock = { now: 0, down: false }
  const ping = () => trackerWatchers.forEach((f) => f())
  const reach = () => { if (clock.down) throw new Error('Failed to fetch') }
  const none = { holder: 'none' as const, idleSeconds: null, name: null }
  const view = (gameId: string, me: string): GameLanes => {
    const one = (lane: Lane): GameLanes[Lane] => {
      const l = leases.get(`${gameId}:${lane}`)
      if (!l || !l.user) return none
      const idle = clock.now - l.seenAt
      return { holder: l.user === me ? 'me' : idle > LEASE ? 'none' : 'other', idleSeconds: idle, name: l.name }
    }
    return { defense: one('defense'), offense: one('offense') }
  }
  const api = (user = 'u'): RemoteApi => ({
    getLanes: async (id) => { reach(); return view(id, user) },
    claimLanes: async (id, lanes, takeOver, name) => {
      reach()
      let changed = false
      for (const lane of lanes) {
        const l = leases.get(`${id}:${lane}`)
        if (takeOver || !l || !l.user || l.user === user || clock.now - l.seenAt > LEASE) { leases.set(`${id}:${lane}`, { user, seenAt: clock.now, name: name || null }); changed = true }
      }
      if (changed) ping()
      return view(id, user)
    },
    releaseLanes: async (id, lanes) => {
      reach()
      let changed = false
      for (const lane of lanes) if (leases.get(`${id}:${lane}`)?.user === user) { leases.set(`${id}:${lane}`, { user: null, seenAt: clock.now, name: null }); changed = true }
      if (changed) ping()
    },
    watchTrackers: (_team, cb) => { trackerWatchers.add(cb); return () => { trackerWatchers.delete(cb) } },
    watchThanks: (_team, cb) => { thanksWatchers.add(cb); return () => { thanksWatchers.delete(cb) } },
    setThanks: async (gameId, on, name) => {
      reach()
      const gate = thanksGates.get(user)
      thanksGates.delete(user)
      await gate
      const game = games.get(gameId)
      if (!game || game.deletedAt) throw new Error('game not found')
      const key = `${gameId}:${user}`
      const cur = thanks.get(key)
      if (on) {
        if (game.status === 'scheduled') throw new Error('game has not started')
        thanks.set(key, { gameId, user, name: name.trim().slice(0, 30) || null, createdAt: cur && !cur.deleted ? cur.createdAt : new Date(++stamp).toISOString(), deleted: false })
      } else if (cur) thanks.set(key, { ...cur, deleted: true })
      thanksWatchers.forEach((f) => f())
    },
    pullThanks: async (teamId) => {
      reach()
      return [...thanks.values()]
        .filter((t) => !t.deleted && games.get(t.gameId)?.teamId === teamId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((t) => ({ gameId: t.gameId, name: t.name, mine: t.user === user, createdAt: t.createdAt }))
    },
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
  return { api, games, events, teams, clock, trackerWatchers, thanks, thanksWatchers, thanksGates }
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

describe('one tracker per lane', () => {
  const setup = async () => {
    const cloud = fakeCloud()
    const a = new LocalRepository({ dbName: `lease-a${n++}`, remote: cloud.api('parent-a'), baseDelayMs: 1 })
    const team = await a.createTeam('Thunder')
    const game = await a.saveGame(gameInput)
    const b = new LocalRepository({ dbName: `lease-b${n++}`, remote: cloud.api('parent-b'), baseDelayMs: 1 })
    await b.joinTeam(team.joinCode)
    return { cloud, a, b, id: game.id }
  }
  const BOTH: Lane[] = ['defense', 'offense']
  /** "me/other": who holds defense and offense, from this phone's point of view. */
  const holders = (l: GameLanes) => `${l.defense.holder}/${l.offense.holder}`

  it('lets the first parent track everything and makes the second one watch', async () => {
    const { a, b, id } = await setup()
    expect(holders(await a.claimLanes(id, BOTH))).toBe('me/me')
    expect(holders(await b.getLanes(id))).toBe('other/other')
    expect(holders(await b.claimLanes(id, BOTH))).toBe('other/other') // cannot barge in
    expect(holders(await a.claimLanes(id, BOTH))).toBe('me/me') // renewing is fine
  })

  it('two parents can split the game: each tracks one lane and neither can tap the other\'s', async () => {
    const { a, b, id } = await setup()
    expect(holders(await a.claimLanes(id, ['defense']))).toBe('me/none')
    expect(holders(await b.claimLanes(id, ['offense']))).toBe('other/me')
    expect(holders(await a.getLanes(id))).toBe('me/other')
    expect(holders(await a.claimLanes(id, ['defense']))).toBe('me/other') // renewing does not disturb the other lane
    expect(holders(await b.claimLanes(id, ['offense']))).toBe('other/me')
  })

  it('a second parent who asks for everything gets just the lane nobody has', async () => {
    const { a, b, id } = await setup()
    await a.claimLanes(id, ['defense'])
    expect(holders(await b.claimLanes(id, BOTH))).toBe('other/me')
  })

  it('the one tracking everything can hand a lane to the other parent without losing the rest', async () => {
    const { a, b, id } = await setup()
    await a.claimLanes(id, BOTH)
    await a.releaseLanes(id, ['offense'])
    expect(holders(await b.getLanes(id))).toBe('other/none')
    expect(holders(await b.claimLanes(id, ['offense']))).toBe('other/me') // no confirmation needed: it was free
    expect(holders(await a.getLanes(id))).toBe('me/other')
  })

  it('a takeover switches who has that lane only, and the old tracker finds out on their next check', async () => {
    const { a, b, id } = await setup()
    await a.claimLanes(id, BOTH)
    expect(holders(await b.claimLanes(id, ['offense'], { takeOver: true }))).toBe('other/me')
    expect(holders(await a.getLanes(id))).toBe('me/other')
    expect(holders(await a.claimLanes(id, BOTH))).toBe('me/other') // heartbeat cannot steal it back
  })

  it('handing off frees the lanes straight away, and only ever your own', async () => {
    const { a, b, id } = await setup()
    await a.claimLanes(id, BOTH)
    await b.releaseLanes(id) // not the tracker: does nothing
    expect(holders(await a.getLanes(id))).toBe('me/me')
    await a.releaseLanes(id) // no lanes given: everything of yours
    expect(await b.getLanes(id)).toEqual({ defense: { holder: 'none', idleSeconds: null, name: null }, offense: { holder: 'none', idleSeconds: null, name: null } })
    expect(holders(await b.claimLanes(id, BOTH))).toBe('me/me')
  })

  it('a tracker who goes quiet for over 2 minutes loses their lanes to whoever asks next', async () => {
    const { cloud, a, b, id } = await setup()
    await a.claimLanes(id, BOTH)
    cloud.clock.now = 100
    expect(holders(await b.claimLanes(id, BOTH))).toBe('other/other')
    expect((await b.claimLanes(id, BOTH)).defense.idleSeconds).toBe(100)
    cloud.clock.now = 121
    expect(holders(await b.getLanes(id))).toBe('none/none')
    expect(holders(await a.getLanes(id))).toBe('me/me') // still theirs until someone else takes it
    expect(holders(await b.claimLanes(id, BOTH))).toBe('me/me')
    expect(holders(await a.claimLanes(id, BOTH))).toBe('other/other')
  })

  it('tells the app when someone claims or releases, so a takeover shows up immediately', async () => {
    const { a, b, id } = await setup()
    const seen = vi.fn()
    const off = b.onTrackerChange(seen)
    await a.claimLanes(id, BOTH)
    await a.releaseLanes(id)
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    await a.claimLanes(id, BOTH)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('without a connection, claiming fails (so the app carries on tracking) but releasing never throws', async () => {
    const { cloud, a, id } = await setup()
    cloud.clock.down = true
    await expect(a.claimLanes(id, BOTH)).rejects.toThrow()
    await expect(a.getLanes(id)).rejects.toThrow()
    await expect(a.releaseLanes(id)).resolves.toBeUndefined()
  })

  it("sends this device's name with every claim so the other parent can see who is tracking", async () => {
    const { a, b, id } = await setup()
    expect(await a.getDisplayName()).toBe('')
    await a.setDisplayName('  Sam  ')
    expect(await a.getDisplayName()).toBe('Sam')
    await a.claimLanes(id, BOTH)
    expect(await b.getLanes(id)).toMatchObject({ defense: { holder: 'other', name: 'Sam' }, offense: { holder: 'other', name: 'Sam' } })
    await b.setDisplayName('Priya')
    expect((await b.claimLanes(id, BOTH)).offense).toMatchObject({ holder: 'other', name: 'Sam' }) // blocked: Sam still shown
    expect((await b.claimLanes(id, ['offense'], { takeOver: true })).offense).toMatchObject({ holder: 'me', name: 'Priya' })
    expect(await a.getLanes(id)).toMatchObject({ defense: { holder: 'me', name: 'Sam' }, offense: { holder: 'other', name: 'Priya' } })
    await a.setDisplayName('x'.repeat(50))
    expect((await a.getDisplayName()).length).toBe(30)
  })

  it('a parent with no name set shows as unnamed', async () => {
    const { a, b, id } = await setup()
    await a.claimLanes(id, BOTH)
    expect((await b.getLanes(id)).defense.name).toBeNull()
  })

  it('demo mode is one device: any lane you ask for is yours', async () => {
    const r = repo()
    await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    expect(holders(await r.claimLanes(g.id, BOTH))).toBe('me/me')
    expect(holders(await r.claimLanes(g.id, ['offense']))).toBe('none/me')
    expect(holders(await r.getLanes(g.id))).toBe('none/none')
    await expect(r.releaseLanes(g.id)).resolves.toBeUndefined()
  })

  it('never blocks stat events: taps a parent made while someone else was tracking still sync', async () => {
    const { cloud, a, b, id } = await setup()
    await a.claimLanes(id, ['defense', 'offense'])
    await vi.waitFor(async () => expect((await b.listGames()).length).toBe(1))
    await b.addEvent(id, ev(id)) // b is only watching, but the data layer stays append-only and lossless
    await vi.waitFor(() => expect(cloud.events.size).toBe(1))
  })
})

describe('thanks (a heart on a game)', () => {
  const setup = async (status: 'scheduled' | 'live' | 'final' = 'live') => {
    const cloud = fakeCloud()
    const a = new LocalRepository({ dbName: `th-a${n++}`, remote: cloud.api('parent-a'), baseDelayMs: 1 })
    const team = await a.createTeam('Thunder')
    const game = await a.saveGame({ ...gameInput, status })
    const b = new LocalRepository({ dbName: `th-b${n++}`, remote: cloud.api('parent-b'), baseDelayMs: 1 })
    await b.joinTeam(team.joinCode)
    await vi.waitFor(() => expect(cloud.games.size).toBe(1))
    return { cloud, a, b, team, id: game.id }
  }
  /** "Sam*, Priya": who gave a heart, from this phone's point of view (* = mine). */
  const who = (l: GameThanks[]) => l.map((t) => `${t.name ?? '?'}${t.mine ? '*' : ''}`).sort().join(',')

  it('demo mode: a heart is given, kept with its name, and taken back, all on this device', async () => {
    const r = repo()
    await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    const changed = vi.fn()
    r.subscribe(changed)
    await r.setDisplayName('Sam')
    await r.setThanks(g.id, true)
    expect(await r.listThanks()).toEqual([{ gameId: g.id, name: 'Sam', mine: true, createdAt: expect.any(String) }])
    expect(changed).toHaveBeenCalled()
    const first = (await r.listThanks())[0].createdAt
    await r.setThanks(g.id, true) // already given: still one heart, from the same moment
    expect(await r.listThanks()).toHaveLength(1)
    expect((await r.listThanks())[0].createdAt).toBe(first)
    await r.setThanks(g.id, false)
    expect(await r.listThanks()).toEqual([])
    await expect(r.setThanks(g.id, false)).resolves.toBeUndefined() // already taken back
  })

  it('needs a team, and keeps each team\'s hearts apart', async () => {
    await expect(repo().setThanks('nope', true)).rejects.toThrow()
    expect(await repo().listThanks()).toEqual([])
    const r = repo()
    const a = await r.createTeam('A')
    const g = await r.saveGame(gameInput)
    await r.setThanks(g.id, true)
    await r.createTeam('B')
    expect(await r.listThanks()).toEqual([])
    await r.switchTeam(a.id)
    expect(await r.listThanks()).toHaveLength(1)
  })

  it('two parents see each other\'s hearts, each marked as theirs or not, and a heart taken back disappears for both', async () => {
    const { a, b, id } = await setup()
    await a.setDisplayName('Sam')
    await a.setThanks(id, true)
    await vi.waitFor(async () => expect(who(await b.listThanks())).toBe('Sam'))
    await b.setThanks(id, true) // b has no name set
    await vi.waitFor(async () => expect(who(await a.listThanks())).toBe('?,Sam*'))
    expect(who(await b.listThanks())).toBe('?*,Sam')
    await a.setThanks(id, false)
    await vi.waitFor(async () => expect(who(await b.listThanks())).toBe('?*'))
    expect(who(await a.listThanks())).toBe('?')
  })

  it('works on a game that is still live and on a finished one, but not on one that has not started', async () => {
    const live = await setup('live')
    await expect(live.a.setThanks(live.id, true)).resolves.toBeUndefined()
    const done = await setup('final')
    await expect(done.a.setThanks(done.id, true)).resolves.toBeUndefined()
    const later = await setup('scheduled')
    await expect(later.a.setThanks(later.id, true)).rejects.toThrow('has not started')
    expect(await later.a.listThanks()).toEqual([]) // what was shown for the tap is undone
  })

  it('without a connection it says so, undoes what it showed, and never turns into a queued sync error', async () => {
    const { cloud, a, b, id } = await setup()
    let sync = ''
    a.onSyncState((s) => { sync = s })
    await a.setThanks(id, true)
    await vi.waitFor(async () => expect(who(await b.listThanks())).toBe('?'))

    cloud.clock.down = true
    await expect(a.setThanks(id, false)).rejects.toThrow()
    expect(who(await a.listThanks())).toBe('?*') // the take-back did not happen, so the heart is still there
    expect(who(await b.listThanks())).toBe('?') // and a phone offline still shows what it last saw
    await expect(b.setThanks(id, true)).rejects.toThrow()
    expect(who(await b.listThanks())).toBe('?') // nothing was left behind by the failed give

    cloud.clock.down = false
    await a.addEvent(id, ev(id)) // stats carry on syncing, and the failed take-back is not replayed
    await vi.waitFor(() => expect(cloud.events.size).toBe(1))
    expect(sync).not.toBe('error')
    expect([...cloud.thanks.values()].map((t) => t.deleted)).toEqual([false])
  })

  it('a heart given and quickly taken back reaches the cloud in that order', async () => {
    const { cloud, a, id } = await setup()
    let release!: () => void
    cloud.thanksGates.set('parent-a', new Promise<void>((res) => { release = res })) // the first one is slow
    const give = a.setThanks(id, true)
    const take = a.setThanks(id, false)
    await new Promise((res) => setTimeout(res, 20)) // long enough for the take-back to overtake the give, if nothing held it back
    release()
    await Promise.all([give, take])
    expect([...cloud.thanks.values()].map((t) => t.deleted)).toEqual([true])
    expect(await a.listThanks()).toEqual([])
  })

  it('an answer from the cloud that predates my own heart does not wipe it off the screen', async () => {
    const { cloud, a, b, id } = await setup()
    await a.setDisplayName('Sam')
    await b.setDisplayName('Priya')
    let release!: () => void
    cloud.thanksGates.set('parent-a', new Promise<void>((res) => { release = res }))
    const sending = a.setThanks(id, true) // on its way, not yet in the cloud
    await vi.waitFor(async () => expect(who(await a.listThanks())).toBe('Sam*'))
    await b.setThanks(id, true) // makes a's phone ask the cloud for hearts, and the answer has no Sam in it
    await new Promise((res) => setTimeout(res, 20))
    expect(who(await a.listThanks())).toBe('Sam*')
    release()
    await sending
    await vi.waitFor(async () => expect(who(await a.listThanks())).toBe('Priya,Sam*'))
  })

  it('hearts come back when a team is re-joined', async () => {
    const { b, a, team, id } = await setup()
    await a.setThanks(id, true)
    await vi.waitFor(async () => expect(await b.listThanks()).toHaveLength(1))
    await b.leaveTeam(team.id)
    expect(await b.listThanks()).toEqual([])
    await b.joinTeam(team.joinCode)
    await vi.waitFor(async () => expect(await b.listThanks()).toHaveLength(1))
  })
})
