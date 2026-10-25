// Thin Supabase adapter: maps between app (camelCase) and DB (snake_case) shapes.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Game, StatEvent, Team, TeamBranding, TeamGoals } from '../types'
import { cleanGoals, hasGoals } from '../lib/goals'
import { isZone } from '../lib/zones'
import { cleanScore } from '../lib/score'
import { cleanClock, cleanMinutes } from '../lib/clock'
import { cleanKickoff } from '../lib/schedule'
import type { GameRec } from './db'
import { PermanentError, type QueueOp } from './queue'
import type { GameLanes, GameThanks, GameTracker, GameViewers } from './repository'
import { LANES, type Lane } from '../lib/lanes'

export interface RemoteApi {
  userId(): Promise<string>
  myTeams(): Promise<Team[]>
  createTeam(name: string): Promise<Team>
  joinTeam(code: string): Promise<Team>
  saveBranding(teamId: string, branding: TeamBranding): Promise<Team>
  saveGoals(teamId: string, goals: TeamGoals): Promise<Team>
  push(op: QueueOp): Promise<void>
  pull(teamId: string): Promise<{ games: GameRec[]; events: StatEvent[] }>
  watch(teamId: string, onChange: () => void, onTeamChange?: () => void): () => void
  getLanes(gameId: string): Promise<GameLanes>
  claimLanes(gameId: string, lanes: Lane[], takeOver: boolean, name: string): Promise<GameLanes>
  releaseLanes(gameId: string, lanes: Lane[]): Promise<void>
  /** Separate from `watch` so a deployment without the tracker migration can't break live stat sync. */
  watchTrackers(teamId: string, onChange: () => void): () => void
  /** Hearts on the team's games. Their own calls, apart from `pull` and `watch`, so a deployment without the thanks migration can't break stat sync. */
  pullThanks(teamId: string): Promise<GameThanks[]>
  setThanks(gameId: string, on: boolean, name: string): Promise<void>
  watchThanks(teamId: string, onChange: () => void): () => void
  /** Check in on a game (when `here`) and read who's watching it. */
  watchGame(gameId: string, here: boolean): Promise<GameViewers>
}

const teamFromRow = (r: any): Team => ({
  id: r.id, name: r.name, joinCode: r.join_code,
  ...(r.branding && r.branding.accent ? { branding: r.branding as TeamBranding } : {}),
  ...(hasGoals(cleanGoals(r.goals)) ? { goals: cleanGoals(r.goals) } : {}),
})
const gameFromRow = (r: any): GameRec => ({
  id: r.id, teamId: r.team_id, opponent: r.opponent, date: r.date,
  location: r.location ?? undefined, home: r.home, periods: r.periods, status: r.status,
  notes: r.notes ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  // A server without 0009_game_score.sql has no score columns at all: leave the score out, so the phone keeps its own.
  ...('score_us' in r ? { score: cleanScore({ us: r.score_us, them: r.score_them }) } : {}),
  // Same for 0010_game_clock.sql and the half lengths and clock.
  ...('half_minutes' in r ? { halfMinutes: cleanMinutes(r.half_minutes, r.periods), clock: cleanClock(r.clock) } : {}),
  // And 0011_game_kickoff.sql and the kick-off time.
  ...('kickoff' in r ? { kickoff: cleanKickoff(r.kickoff) } : {}),
})
const eventFromRow = (r: any): StatEvent => ({
  id: r.id, gameId: r.game_id, category: r.category, outcome: r.outcome,
  ...(r.ball_type ? { ballType: r.ball_type } : {}),
  ...(isZone(r.zone) ? { zone: r.zone } : {}),
  period: r.period, createdAt: r.created_at, deletedAt: r.deleted_at, keeperId: r.keeper_id ?? undefined,
}) as StatEvent

export function toGameRow(g: GameRec & Record<string, unknown>) {
  return {
    id: g.id, team_id: g.teamId, opponent: g.opponent, date: g.date, location: g.location ?? null,
    home: g.home, periods: g.periods, status: g.status, notes: g.notes ?? null,
    created_at: g.createdAt, updated_at: g.updatedAt, deleted_at: g.deletedAt ?? null,
    // Only sent once a score was entered (or cleared), so other game saves still sync to a server without 0009_game_score.sql.
    ...(g.score !== undefined ? { score_us: g.score?.us ?? null, score_them: g.score?.them ?? null } : {}),
    // Likewise the half lengths and clock, for a server without 0010_game_clock.sql.
    ...(g.halfMinutes !== undefined || g.clock !== undefined ? { half_minutes: g.halfMinutes ?? null, clock: g.clock ?? null } : {}),
    // And the kick-off time, for a server without 0011_game_kickoff.sql.
    ...(g.kickoff !== undefined ? { kickoff: g.kickoff ?? null } : {}),
  }
}
export function toEventRow(e: StatEvent & { teamId?: string }) {
  return {
    id: e.id, game_id: e.gameId, team_id: e.teamId, category: e.category, outcome: e.outcome,
    ball_type: 'ballType' in e ? e.ballType : null, period: e.period, created_at: e.createdAt,
    deleted_at: e.deletedAt ?? null, keeper_id: e.keeperId ?? null,
    // Only sent when there is one, so taps without a zone still sync to a server that hasn't run 0008_event_zones.sql.
    ...(e.zone ? { zone: e.zone } : {}),
  }
}

/** PostgREST's answer when a row names a column the server doesn't have (`zone` before 0008_event_zones.sql, `score_*` before 0009, ...). */
const missingColumn = (error: { code?: string; message: string } | null, col: RegExp) => !!error && error.code === 'PGRST204' && col.test(error.message)
/** Columns a row can go without when the server hasn't run their migration yet, and what to leave out for each. */
const OPTIONAL_COLUMNS: [RegExp, string[]][] = [
  [/zone/, ['zone']],
  [/score_/, ['score_us', 'score_them']],
  [/half_minutes|'clock'/, ['half_minutes', 'clock']],
  [/kickoff/, ['kickoff']],
]

const trackerFromRow = (r: any): GameTracker => ({ holder: r.holder, idleSeconds: r.idle_seconds ?? null, name: r.name ?? null })
/** The tracker functions answer with one row per lane; a lane missing from the answer is simply nobody's. */
const lanesFromRows = (rows: any): GameLanes => {
  const out = {} as GameLanes
  for (const l of LANES) out[l] = { holder: 'none', idleSeconds: null, name: null }
  for (const r of Array.isArray(rows) ? rows : [rows]) if (r && LANES.includes(r.lane)) out[r.lane as Lane] = trackerFromRow(r)
  return out
}

const PAGE = 500

const thanksFromRow = (r: any, uid: string): GameThanks => ({
  gameId: r.game_id, name: r.name ?? null, mine: r.user_id === uid, createdAt: r.created_at,
})

function wrap(error: { code?: string; message: string } | null) {
  if (!error) return
  // Postgres integrity/permission errors will never succeed on retry.
  if (error.code && /^(23|42|22|P0)/.test(error.code)) throw new PermanentError(error.message)
  throw new Error(error.message)
}

export function createSupabaseRemote(url: string, key: string): RemoteApi {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  let uid: Promise<string> | null = null
  const userId = () =>
    (uid ??= (async () => {
      const { data } = await sb.auth.getSession()
      if (data.session) return data.session.user.id
      const res = await sb.auth.signInAnonymously()
      if (res.error || !res.data.user) throw new Error(res.error?.message ?? 'Anonymous sign-in failed')
      return res.data.user.id
    })().catch((e) => { uid = null; throw e }))

  return {
    userId,
    async myTeams() {
      await userId()
      const { data, error } = await sb.from('teams').select('*').order('created_at')
      wrap(error)
      return (data ?? []).map(teamFromRow)
    },
    async createTeam(name) {
      await userId()
      const { data, error } = await sb.rpc('create_team', { team_name: name })
      wrap(error)
      return teamFromRow(Array.isArray(data) ? data[0] : data)
    },
    async joinTeam(code) {
      await userId()
      const { data, error } = await sb.rpc('join_team', { code: code.trim().toUpperCase() })
      if (error) throw new Error(/not found|invalid/i.test(error.message) ? 'No team found with that code' : error.message)
      return teamFromRow(Array.isArray(data) ? data[0] : data)
    },
    async saveBranding(teamId, branding) {
      await userId()
      const { data, error } = await sb.rpc('set_team_branding', { team: teamId, b: branding })
      wrap(error)
      return teamFromRow(Array.isArray(data) ? data[0] : data)
    },
    async saveGoals(teamId, goals) {
      await userId()
      const { data, error } = await sb.rpc('set_team_goals', { team: teamId, g: cleanGoals(goals) })
      if (error && /set_team_goals|schema cache/i.test(error.message)) throw new Error('Targets need the 0007_team_goals.sql migration on the server')
      wrap(error)
      return teamFromRow(Array.isArray(data) ? data[0] : data)
    },
    async push(op) {
      await userId()
      const row: Record<string, unknown> = op.table === 'games' ? toGameRow(op.row as any) : toEventRow(op.row as any)
      let { error } = await sb.from(op.table).upsert(row, { onConflict: 'id' })
      // Without the migration a zoned tap would be refused for ever and block every tap behind it. Send it without the
      // zone instead: the stat is what matters, and this phone still has the zone for its own map. Same for a game's
      // score, half lengths, clock and kick-off: the game itself must still sync, and they stay on this phone. The server names one
      // missing column at a time, so keep going until it takes the row.
      for (let tries = 0; tries < OPTIONAL_COLUMNS.length; tries++) {
        const drop = OPTIONAL_COLUMNS.find(([col]) => missingColumn(error, col))
        if (!drop) break
        for (const c of drop[1]) row[c] = undefined
        ;({ error } = await sb.from(op.table).upsert({ ...row }, { onConflict: 'id' }))
      }
      wrap(error)
    },
    async pull(teamId) {
      await userId()
      // PostgREST caps a response at ~1000 rows, so page through everything.
      const all = async (table: string, order: string) => {
        const rows: any[] = []
        for (let from = 0; ; from += PAGE) {
          const r = await sb.from(table).select('*').eq('team_id', teamId).order(order).order('id').range(from, from + PAGE - 1)
          wrap(r.error)
          rows.push(...(r.data ?? []))
          if ((r.data ?? []).length < PAGE) return rows
        }
      }
      const [g, e] = [await all('games', 'created_at'), await all('stat_events', 'created_at')]
      return { games: g.map(gameFromRow), events: e.map(eventFromRow) }
    },
    watch(teamId, onChange, onTeamChange) {
      const ch = sb.channel(`team-${teamId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stat_events', filter: `team_id=eq.${teamId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `team_id=eq.${teamId}` }, onChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, () => onTeamChange?.())
        .subscribe()
      return () => { void sb.removeChannel(ch) }
    },
    async getLanes(gameId) {
      await userId()
      const { data, error } = await sb.rpc('get_game_lanes', { game: gameId })
      if (error) throw new Error(error.message)
      return lanesFromRows(data)
    },
    async claimLanes(gameId, lanes, takeOver, name) {
      await userId()
      const { data, error } = await sb.rpc('claim_game_lanes', { game: gameId, wanted: lanes, take_over: takeOver, display_name: name })
      if (error) throw new Error(error.message)
      return lanesFromRows(data)
    },
    async releaseLanes(gameId, lanes) {
      await userId()
      const { error } = await sb.rpc('release_game_lanes', { game: gameId, lanes })
      if (error) throw new Error(error.message)
    },
    watchTrackers(teamId, onChange) {
      const ch = sb.channel(`trackers-${teamId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_trackers', filter: `team_id=eq.${teamId}` }, onChange)
        .subscribe()
      return () => { void sb.removeChannel(ch) }
    },
    async pullThanks(teamId) {
      const uid = await userId()
      const rows: any[] = []
      for (let from = 0; ; from += PAGE) {
        const r = await sb.from('game_thanks').select('*').eq('team_id', teamId).is('deleted_at', null)
          .order('created_at').order('game_id').order('user_id').range(from, from + PAGE - 1)
        if (r.error) throw new Error(r.error.message)
        rows.push(...(r.data ?? []))
        if ((r.data ?? []).length < PAGE) return rows.map((x) => thanksFromRow(x, uid))
      }
    },
    async setThanks(gameId, on, name) {
      await userId()
      const { error } = await sb.rpc('set_game_thanks', { game: gameId, given: on, display_name: name })
      if (error) throw new Error(error.message)
    },
    watchThanks(teamId, onChange) {
      const ch = sb.channel(`thanks-${teamId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_thanks', filter: `team_id=eq.${teamId}` }, onChange)
        .subscribe()
      return () => { void sb.removeChannel(ch) }
    },
    async watchGame(gameId, here) {
      await userId()
      const { data, error } = await sb.rpc('watch_game', { game: gameId, here })
      if (error) throw new Error(error.message)
      const r = Array.isArray(data) ? data[0] : data
      return { watching: Number(r?.watching) || 0, followed: Number(r?.followed) || 0 }
    },
  }
}

export type { Game }
