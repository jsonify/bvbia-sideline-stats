// Thin Supabase adapter: maps between app (camelCase) and DB (snake_case) shapes.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Game, StatEvent, Team, TeamBranding } from '../types'
import type { GameRec } from './db'
import { PermanentError, type QueueOp } from './queue'
import type { GameTracker } from './repository'

export interface RemoteApi {
  userId(): Promise<string>
  myTeams(): Promise<Team[]>
  createTeam(name: string): Promise<Team>
  joinTeam(code: string): Promise<Team>
  saveBranding(teamId: string, branding: TeamBranding): Promise<Team>
  push(op: QueueOp): Promise<void>
  pull(teamId: string): Promise<{ games: GameRec[]; events: StatEvent[] }>
  watch(teamId: string, onChange: () => void, onTeamChange?: () => void): () => void
  getTracker(gameId: string): Promise<GameTracker>
  claimTracker(gameId: string, takeOver: boolean): Promise<GameTracker>
  releaseTracker(gameId: string): Promise<void>
  /** Separate from `watch` so a deployment without the tracker migration can't break live stat sync. */
  watchTrackers(teamId: string, onChange: () => void): () => void
}

const teamFromRow = (r: any): Team => ({
  id: r.id, name: r.name, joinCode: r.join_code,
  ...(r.branding && r.branding.accent ? { branding: r.branding as TeamBranding } : {}),
})
const gameFromRow = (r: any): GameRec => ({
  id: r.id, teamId: r.team_id, opponent: r.opponent, date: r.date,
  location: r.location ?? undefined, home: r.home, periods: r.periods, status: r.status,
  notes: r.notes ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
})
const eventFromRow = (r: any): StatEvent => ({
  id: r.id, gameId: r.game_id, category: r.category, outcome: r.outcome,
  ...(r.ball_type ? { ballType: r.ball_type } : {}),
  period: r.period, createdAt: r.created_at, deletedAt: r.deleted_at, keeperId: r.keeper_id ?? undefined,
}) as StatEvent

export function toGameRow(g: GameRec & Record<string, unknown>) {
  return {
    id: g.id, team_id: g.teamId, opponent: g.opponent, date: g.date, location: g.location ?? null,
    home: g.home, periods: g.periods, status: g.status, notes: g.notes ?? null,
    created_at: g.createdAt, updated_at: g.updatedAt, deleted_at: g.deletedAt ?? null,
  }
}
export function toEventRow(e: StatEvent & { teamId?: string }) {
  return {
    id: e.id, game_id: e.gameId, team_id: e.teamId, category: e.category, outcome: e.outcome,
    ball_type: 'ballType' in e ? e.ballType : null, period: e.period, created_at: e.createdAt,
    deleted_at: e.deletedAt ?? null, keeper_id: e.keeperId ?? null,
  }
}

const trackerFromRow = (r: any): GameTracker => ({ holder: r.holder, idleSeconds: r.idle_seconds ?? null })

const PAGE = 500

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
    async push(op) {
      await userId()
      const row: Record<string, unknown> = op.table === 'games' ? toGameRow(op.row as any) : toEventRow(op.row as any)
      const { error } = await sb.from(op.table).upsert(row, { onConflict: 'id' })
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
    async getTracker(gameId) {
      await userId()
      const { data, error } = await sb.rpc('get_game_tracker', { game: gameId })
      if (error) throw new Error(error.message)
      return trackerFromRow(Array.isArray(data) ? data[0] : data)
    },
    async claimTracker(gameId, takeOver) {
      await userId()
      const { data, error } = await sb.rpc('claim_game_tracker', { game: gameId, take_over: takeOver })
      if (error) throw new Error(error.message)
      return trackerFromRow(Array.isArray(data) ? data[0] : data)
    },
    async releaseTracker(gameId) {
      await userId()
      const { error } = await sb.rpc('release_game_tracker', { game: gameId })
      if (error) throw new Error(error.message)
    },
    watchTrackers(teamId, onChange) {
      const ch = sb.channel(`trackers-${teamId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_trackers', filter: `team_id=eq.${teamId}` }, onChange)
        .subscribe()
      return () => { void sb.removeChannel(ch) }
    },
  }
}

export type { Game }
