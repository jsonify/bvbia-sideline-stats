// Local-first Repository. Always reads/writes IndexedDB; if a `remote` is supplied,
// writes are also queued for cloud upsert and remote changes are pulled into the cache.
import type { Game, NewStatEvent, StatEvent, Team, TeamBranding, Uuid } from '../types'
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
      window.addEventListener('online', () => { this.queue?.kick(); void this.pull(); void this.refreshTeam() })
      window.addEventListener('offline', () => void this.queue?.init())
    }
    await this.queue.init()
    await this.adoptLocalTeams()
    const team = await this.getTeam()
    if (team) this.attach(team)
  }

  // --- team bookkeeping -------------------------------------------------------------------------
  // kv 'teams' = every team this device has joined; kv 'activeTeam' = the one being viewed;
  // kv 'localOnly' = ids of teams created without a cloud connection (moved to the cloud once one exists).

  private async readTeams(): Promise<Team[]> {
    const db = await this.dbp
    const teams = (await db.get('kv', 'teams')) as Team[] | undefined
    if (teams) return teams
    const legacy = (await db.get('kv', 'team')) as Team | undefined // single-team versions of the app
    if (legacy) {
      await db.put('kv', [legacy], 'teams')
      await db.put('kv', legacy.id, 'activeTeam')
      if (!this.remote) await db.put('kv', [legacy.id], 'localOnly')
      return [legacy]
    }
    return []
  }
  private async writeTeams(teams: Team[]) { await (await this.dbp).put('kv', teams, 'teams') }
  private async activeId(): Promise<string | null> {
    return ((await (await this.dbp).get('kv', 'activeTeam')) as string | undefined) ?? null
  }
  private async setActive(id: string | null) {
    const db = await this.dbp
    if (id) await db.put('kv', id, 'activeTeam'); else await db.delete('kv', 'activeTeam')
  }
  private async localOnlyIds(): Promise<string[]> {
    return ((await (await this.dbp).get('kv', 'localOnly')) as string[] | undefined) ?? []
  }
  private async setLocalOnly(ids: string[]) { await (await this.dbp).put('kv', ids, 'localOnly') }

  /** Teams made before a cloud connection existed get created in the cloud, and their games move across. */
  private async adoptLocalTeams() {
    if (!this.remote) return
    try {
      const ids = await this.localOnlyIds()
      if (!ids.length) return
      const db = await this.dbp
      let teams = await this.readTeams()
      let active = await this.activeId()
      const remaining: string[] = []
      for (const id of ids) {
        const old = teams.find((t) => t.id === id)
        if (!old) continue
        try {
          const cloud = await this.remote.createTeam(old.name)
          if (old.branding) await this.remote.saveBranding(cloud.id, old.branding).catch(() => {})
          const fresh: Team = { ...cloud, branding: old.branding ?? cloud.branding }
          for (const g of await db.getAll('games')) if (g.teamId === id) await db.put('games', { ...g, teamId: fresh.id })
          teams = teams.map((t) => (t.id === id ? fresh : t))
          if (active === id) active = fresh.id
        } catch { remaining.push(id) } // offline: try again next launch
      }
      await this.writeTeams(teams)
      await this.setActive(active)
      await this.setLocalOnly(remaining)
    } catch { /* retried next launch */ }
  }

  private attach(team: Team) {
    if (!this.remote || this.watchedTeam === team.id) return
    this.unwatch?.()
    this.watchedTeam = team.id
    this.unwatch = this.remote.watch(team.id, () => void this.pull(), () => void this.refreshTeam())
    void this.backfill(team).then(() => this.pull())
    void this.refreshTeam()
  }

  private detach() {
    this.unwatch?.()
    this.unwatch = null
    this.watchedTeam = null
  }

  /** Merge remote state into cache. Safe to call anytime; failures are silent (we're offline). */
  pull(): Promise<void> {
    if (!this.remote) return Promise.resolve()
    if (this.pulling) return this.pulling
    this.pulling = (async () => {
      try {
        const db = await this.dbp
        const activeId = await this.activeId()
        const team = (await this.readTeams()).find((t) => t.id === activeId)
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

  /**
   * One-time upload of games/stats that already existed on this device before it was linked to the cloud team
   * (e.g. tracked while offline before first sync). Upserts are idempotent, so re-running is safe.
   * Games whose team id belongs to no team on this device are re-homed onto this team.
   */
  async backfill(team: Team): Promise<void> {
    if (!this.remote) return
    try {
      await this.ready
      const db = await this.dbp
      const flag = `backfill:${team.id}`
      if (await db.get('kv', flag)) return
      const known = new Set((await this.readTeams()).map((t) => t.id))
      const mine = new Set<string>()
      for (const g of await db.getAll('games')) {
        if (g.teamId !== team.id && known.has(g.teamId)) continue // belongs to another team on this device
        const row = g.teamId === team.id ? g : { ...g, teamId: team.id }
        if (row !== g) await db.put('games', row)
        mine.add(g.id)
        await this.queue?.enqueue({ table: 'games', row: { ...row } })
      }
      for (const e of await db.getAll('events'))
        if (mine.has(e.gameId)) await this.queue?.enqueue({ table: 'stat_events', row: { ...e, teamId: team.id } })
      await db.put('kv', true, flag)
    } catch { /* retried next launch: the flag is only set after everything was queued */ }
  }

  /** Pick up team name/branding changes made on another phone. */
  private async refreshTeam() {
    if (!this.remote) return
    try {
      const fresh = await this.remote.myTeams()
      const teams = await this.readTeams()
      let changed = false
      const next = teams.map((t) => {
        const f = fresh.find((x) => x.id === t.id)
        if (!f) return t
        if (f.name !== t.name || JSON.stringify(f.branding ?? null) !== JSON.stringify(t.branding ?? null)) { changed = true; return f }
        return t
      })
      if (changed) { await this.writeTeams(next); this.emit() }
    } catch { /* offline */ }
  }

  async saveBranding(branding: TeamBranding): Promise<Team> {
    await this.ready
    const cur = await this.requireTeam()
    const team: Team = this.remote ? await this.remote.saveBranding(cur.id, branding) : { ...cur, branding }
    await this.writeTeams((await this.readTeams()).map((t) => (t.id === team.id ? team : t)))
    this.emit()
    return team
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

  /** Add (or refresh) a team on this device and make it the active one. */
  private async setTeam(team: Team, localOnly = false) {
    const teams = await this.readTeams()
    await this.writeTeams(teams.some((t) => t.id === team.id) ? teams.map((t) => (t.id === team.id ? team : t)) : [...teams, team])
    if (localOnly) await this.setLocalOnly([...(await this.localOnlyIds()), team.id])
    await this.setActive(team.id)
    this.attach(team)
    this.emit()
  }

  async getTeam(): Promise<Team | null> {
    const teams = await this.readTeams()
    const id = await this.activeId()
    const active = teams.find((t) => t.id === id) ?? (teams.length && !id ? teams[0] : undefined)
    if (active) return active
    const everSetUp = (await (await this.dbp).get('kv', 'teams')) !== undefined // false only on a brand-new browser
    if (this.remote && !everSetUp) {
      try { // fresh browser but an existing cloud session: recover memberships
        const mine = await this.remote.myTeams()
        if (mine.length) { await this.writeTeams(mine); await this.setActive(mine[0].id); this.attach(mine[0]); return mine[0] }
      } catch { /* offline */ }
    }
    return null
  }

  async listTeams(): Promise<Team[]> {
    await this.ready
    return this.readTeams()
  }

  async switchTeam(id: Uuid): Promise<Team> {
    await this.ready
    const team = (await this.readTeams()).find((t) => t.id === id)
    if (!team) throw new Error('That team is not on this device')
    await this.setActive(team.id)
    this.attach(team)
    this.emit()
    return team
  }

  /**
   * Remove a team from this device. Its data stays in the cloud and comes back by re-joining with the team code.
   * Local copies are deleted only when everything has been uploaded, so no unsynced stats are lost.
   */
  async leaveTeam(id: Uuid): Promise<void> {
    await this.ready
    const db = await this.dbp
    const teams = await this.readTeams()
    if (!teams.some((t) => t.id === id)) return
    const rest = teams.filter((t) => t.id !== id)
    const safeToPurge = !!this.remote && this.lastState[1] === 0
    if (safeToPurge) {
      for (const g of await db.getAll('games')) {
        if (g.teamId !== id) continue
        for (const e of await db.getAllFromIndex('events', 'byGame', g.id)) await db.delete('events', e.id)
        await db.delete('games', g.id)
      }
      await db.delete('kv', `backfill:${id}`)
    }
    await this.writeTeams(rest)
    await this.setLocalOnly((await this.localOnlyIds()).filter((x) => x !== id))
    if ((await this.activeId()) === id) {
      await this.setActive(rest[0]?.id ?? null)
      if (rest[0]) this.attach(rest[0]); else this.detach()
    }
    this.emit()
  }

  async createTeam(name: string): Promise<Team> {
    await this.ready
    const clean = name.trim()
    if (!clean) throw new Error('Team name is required')
    const team = this.remote
      ? await this.remote.createTeam(clean)
      : { id: uuid(), name: clean, joinCode: genCode() }
    await this.setTeam(team, !this.remote)
    return team
  }

  async joinTeam(joinCode: string): Promise<Team> {
    await this.ready
    const code = joinCode.trim().toUpperCase()
    if (!code) throw new Error('Enter a join code')
    let team: Team
    if (this.remote) team = await this.remote.joinTeam(code)
    else {
      const found = (await this.readTeams()).find((t) => t.joinCode === code)
      if (!found) throw new Error('Demo mode: data lives on this device only, so you can only join a team created here')
      team = found
    }
    await this.setTeam(team)
    return team
  }

  async listGames(): Promise<Game[]> {
    await this.ready
    const db = await this.dbp
    const active = await this.activeId()
    const all = await db.getAll('games')
    return all
      .filter((g) => !g.deletedAt && g.teamId === active)
      .map(({ deletedAt: _d, ...g }) => g as Game)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }

  async getGame(id: Uuid): Promise<Game | null> {
    await this.ready
    const g = await (await this.dbp).get('games', id)
    if (!g || g.deletedAt || g.teamId !== (await this.activeId())) return null
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
    const active = await this.activeId()
    const games = new Map((await db.getAll('games')).filter((g) => g.teamId === active).map((g) => [g.id, g]))
    return (await db.getAll('events'))
      .filter((e) => !e.deletedAt && games.has(e.gameId) && !games.get(e.gameId)!.deletedAt && (!filter || filter(e)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  listEvents(gameId: Uuid) { return this.liveEvents((e) => e.gameId === gameId) }
  listAllEvents() { return this.liveEvents() }

  async addEvent(gameId: Uuid, e: NewStatEvent): Promise<StatEvent> {
    await this.ready
    const db = await this.dbp
    const game = await db.get('games', gameId)
    const team = game ? { id: game.teamId } : await this.requireTeam()
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
    const game = await db.get('games', cur.gameId)
    const team = game ? { id: game.teamId } : await this.requireTeam()
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
