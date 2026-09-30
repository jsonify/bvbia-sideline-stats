// Local-first Repository. Always reads/writes IndexedDB; if a `remote` is supplied,
// writes are also queued for cloud upsert and remote changes are pulled into the cache.
import type { Game, NewStatEvent, StatEvent, Team, Uuid } from '../types'
import type { Repository, SyncState } from './repository'
import { openLocalDB, idbQueueStore, uuid, type GameRec, type LocalDB } from './db'
import { WriteQueue, type QueueStore } from './queue'
import type { RemoteApi } from './remote'

export interface RepoOptions {
  db?: LocalDB
  dbName?: string
  remote?: RemoteApi | null
  queueStore?: QueueStore
  now?: () => string
  isOnline?: () => boolean
  baseDelayMs?: number
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function genCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}

const later = (a?: string | null, b?: string | null) => (a && b ? (a > b ? a : b) : a ?? b ?? null)

export class LocalRepository implements Repository {
  private dbp: Promise<LocalDB>
  private listeners = new Set<() => void>()
  private queue: WriteQueue | null = null
  private unwatch: (() => void) | null = null
  private watchedTeam: string | null = null
  private pulling: Promise<void> | null = null
  private remote: RemoteApi | null
  private now: () => string
  private ready: Promise<void>
  private lastState: [SyncState, number] = ['synced', 0]

  constructor(private opts: RepoOptions = {}) {
    this.remote = opts.remote ?? null
    this.now = opts.now ?? (() => new Date().toISOString())
    this.dbp = opts.db ? Promise.resolve(opts.db) : openLocalDB(opts.dbName)
    this.ready = this.start()
  }

  private async start() {
    const db = await this.dbp
    if (!this.remote) return
    this.queue = new WriteQueue({
      store: this.opts.queueStore ?? idbQueueStore(db),
      send: (op) => this.remote!.push(op),
      isOnline: this.opts.isOnline,
      baseDelayMs: this.opts.baseDelayMs,
    })
    this.queue.onState((s, n) => { this.lastState = [s, n] })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.queue?.kick(); void this.pull() })
      window.addEventListener('offline', () => void this.queue?.init())
    }
    await this.queue.init()
    const team = await this.getTeam()
    if (team) this.attach(team)
  }

  private attach(team: Team) {
    if (!this.remote || this.watchedTeam === team.id) return
    this.unwatch?.()
    this.watchedTeam = team.id
    this.unwatch = this.remote.watch(team.id, () => void this.pull())
    void this.pull()
  }

  /** Merge remote state into cache. Safe to call anytime; failures are silent (we're offline). */
  pull(): Promise<void> {
    if (!this.remote) return Promise.resolve()
    if (this.pulling) return this.pulling
    this.pulling = (async () => {
      try {
        const db = await this.dbp
        const team = await db.get('kv', 'team') as Team | undefined
        if (!team) return
        const { games, events } = await this.remote!.pull(team.id)
        const tx = db.transaction(['games', 'events'], 'readwrite')
        let changed = false
        for (const g of games) {
          const cur = await tx.objectStore('games').get(g.id)
          if (!cur || g.updatedAt > cur.updatedAt) { await tx.objectStore('games').put(g); changed = true }
        }
        for (const e of events) {
          const cur = await tx.objectStore('events').get(e.id)
          if (!cur) { await tx.objectStore('events').put(e); changed = true }
          else if (e.deletedAt && !cur.deletedAt) { await tx.objectStore('events').put({ ...cur, deletedAt: e.deletedAt }); changed = true }
        }
        await tx.done
        if (changed) this.emit()
      } catch { /* offline: cache stays as-is */ } finally { this.pulling = null }
    })()
    return this.pulling
  }

  private emit() { this.listeners.forEach((l) => l()) }

  private async requireTeam(): Promise<Team> {
    const t = await this.getTeam()
    if (!t) throw new Error('Join or create a team first')
    return t
  }

  private async keeper(): Promise<string> {
    const db = await this.dbp
    let id = (await db.get('kv', 'deviceId')) as string | undefined
    if (!id) { id = uuid(); await db.put('kv', id, 'deviceId') }
    return id
  }

  private async setTeam(team: Team) {
    const db = await this.dbp
    await db.put('kv', team, 'team')
    this.attach(team)
    this.emit()
  }

  async getTeam(): Promise<Team | null> {
    const db = await this.dbp
    const cached = (await db.get('kv', 'team')) as Team | undefined
    if (cached) return cached
    if (this.remote) {
      try {
        const t = await this.remote.myTeam()
        if (t) { await db.put('kv', t, 'team'); this.attach(t); return t }
      } catch { /* offline */ }
    }
    return null
  }

  async createTeam(name: string): Promise<Team> {
    await this.ready
    const clean = name.trim()
    if (!clean) throw new Error('Team name is required')
    const team = this.remote
      ? await this.remote.createTeam(clean)
      : { id: uuid(), name: clean, joinCode: genCode() }
    await this.setTeam(team)
    return team
  }

  async joinTeam(joinCode: string): Promise<Team> {
    await this.ready
    const code = joinCode.trim().toUpperCase()
    if (!code) throw new Error('Enter a join code')
    let team: Team
    if (this.remote) team = await this.remote.joinTeam(code)
    else {
      const cur = await this.getTeam()
      if (!cur || cur.joinCode !== code)
        throw new Error('Demo mode: data lives on this device only, so you can only join a team created here')
      team = cur
    }
    await this.setTeam(team)
    return team
  }

  async listGames(): Promise<Game[]> {
    await this.ready
    const db = await this.dbp
    const all = await db.getAll('games')
    return all
      .filter((g) => !g.deletedAt)
      .map(({ deletedAt: _d, ...g }) => g as Game)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }

  async getGame(id: Uuid): Promise<Game | null> {
    await this.ready
    const g = await (await this.dbp).get('games', id)
    if (!g || g.deletedAt) return null
    const { deletedAt: _d, ...rest } = g
    return rest as Game
  }

  private async putGame(g: GameRec) {
    const db = await this.dbp
    await db.put('games', g)
    await this.queue?.enqueue({ table: 'games', row: { ...g } })
    this.emit()
  }

  async saveGame(input: Omit<Game, 'id' | 'teamId' | 'createdAt' | 'updatedAt'> & { id?: Uuid }): Promise<Game> {
    await this.ready
    const team = await this.requireTeam()
    const db = await this.dbp
    const now = this.now()
    const existing = input.id ? await db.get('games', input.id) : undefined
    const game: Game = {
      ...input,
      id: input.id ?? uuid(),
      teamId: team.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await this.putGame(game)
    return game
  }

  async deleteGame(id: Uuid): Promise<void> {
    await this.ready
    const db = await this.dbp
    const g = await db.get('games', id)
    if (!g) return
    await this.putGame({ ...g, deletedAt: this.now(), updatedAt: this.now() })
  }

  private async liveEvents(filter?: (e: StatEvent) => boolean): Promise<StatEvent[]> {
    await this.ready
    const db = await this.dbp
    const games = new Map((await db.getAll('games')).map((g) => [g.id, g]))
    return (await db.getAll('events'))
      .filter((e) => !e.deletedAt && !games.get(e.gameId)?.deletedAt && (!filter || filter(e)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  listEvents(gameId: Uuid) { return this.liveEvents((e) => e.gameId === gameId) }
  listAllEvents() { return this.liveEvents() }

  async addEvent(gameId: Uuid, e: NewStatEvent): Promise<StatEvent> {
    await this.ready
    const team = await this.requireTeam()
    const db = await this.dbp
    const event = { ...e, id: uuid(), gameId, createdAt: this.now(), deletedAt: null, keeperId: await this.keeper() } as StatEvent
    await db.put('events', event)
    await this.queue?.enqueue({ table: 'stat_events', row: { ...event, teamId: team.id } })
    this.emit()
    return event
  }

  async undoEvent(eventId: Uuid): Promise<void> {
    await this.ready
    const db = await this.dbp
    const cur = await db.get('events', eventId)
    if (!cur || cur.deletedAt) return
    const ev = { ...cur, deletedAt: later(this.now(), null) } as StatEvent
    const team = await this.requireTeam()
    await db.put('events', ev)
    await this.queue?.enqueue({ table: 'stat_events', row: { ...ev, teamId: team.id } })
    this.emit()
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  onSyncState(cb: (s: SyncState, pending: number) => void): () => void {
    if (!this.queue) {
      cb('synced', 0)
      // queue is created asynchronously in cloud mode; attach once ready
      if (!this.remote) return () => {}
    }
    let off: (() => void) | null = null
    let cancelled = false
    void this.ready.then(() => {
      if (cancelled || !this.queue) return
      off = this.queue.onState(cb)
    })
    return () => { cancelled = true; off?.() }
  }
}
