// Thin Supabase adapter: maps between app (camelCase) and DB (snake_case) shapes.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Game, StatEvent, Team, TeamBranding } from '../types'
import type { GameRec } from './db'
import { PermanentError, type QueueOp } from './queue'

export interface RemoteApi {
  userId(): Promise<string>
  myTeam(): Promise<Team | null>
  createTeam(name: string): Promise<Team>
  joinTeam(code: string): Promise<Team>
  saveBranding(teamId: string, branding: TeamBranding): Promise<Team>
  push(op: QueueOp): Promise<void>
  pull(teamId: string): Promise<{ games: GameRec[]; events: StatEvent[] }>
  watch(teamId: string, onChange: () => void, onTeamChange?: () => void): () => void
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
    async myTeam() {
      await userId()
      const { data, error } = await sb.from('teams').select('*').limit(1)
      wrap(error)
      return data && data[0] ? teamFromRow(data[0]) : null
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
  }
}

export type { Game }
