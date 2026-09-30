// SHARED CONTRACT — the only way UI code touches data. Implemented by the data-layer agent.
import type { Game, NewStatEvent, StatEvent, Team, TeamBranding, Uuid } from '../types'

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'

/**
 * Who is tracking a game right now. Only one parent tracks a game at a time; everyone else watches live.
 *  me     this phone holds the game
 *  other  another parent holds it (and checked in `idleSeconds` ago)
 *  none   nobody does: never claimed, handed off, or the last tracker went quiet for too long
 */
export interface GameTracker {
  holder: 'me' | 'other' | 'none'
  idleSeconds: number | null
}

export interface Repository {
  /** The active team on this device (null → show onboarding). Games and stats are always scoped to it. */
  getTeam(): Promise<Team | null>
  /** Every team this device has joined. */
  listTeams(): Promise<Team[]>
  /** Make another joined team the active one. */
  switchTeam(id: Uuid): Promise<Team>
  /** Remove a team from this device (its cloud data stays; re-join with the team code). */
  leaveTeam(id: Uuid): Promise<void>
  createTeam(name: string): Promise<Team>
  joinTeam(joinCode: string): Promise<Team>
  /** Save the team's logo + colors (shared with every member). Needs a connection in cloud mode. */
  saveBranding(branding: TeamBranding): Promise<Team>

  listGames(): Promise<Game[]>
  getGame(id: Uuid): Promise<Game | null>
  saveGame(game: Omit<Game, 'id' | 'teamId' | 'createdAt' | 'updatedAt'> & { id?: Uuid }): Promise<Game>
  deleteGame(id: Uuid): Promise<void>

  /** Non-deleted events for a game. */
  listEvents(gameId: Uuid): Promise<StatEvent[]>
  /** All non-deleted events for the team (season view). */
  listAllEvents(): Promise<StatEvent[]>
  addEvent(gameId: Uuid, e: NewStatEvent): Promise<StatEvent>
  /** Soft-delete (undo). */
  undoEvent(eventId: Uuid): Promise<void>

  /**
   * Tracking lease. One parent tracks a game at a time so the same play is never tapped twice.
   * It only coordinates who the UI lets tap: stat events are never rejected, so taps made offline are never lost.
   * All three reject when the cloud can't be reached; callers should carry on tracking (offline-first).
   */
  getTracker(gameId: Uuid): Promise<GameTracker>
  /** Start (or keep) tracking. Fails to `other` if someone else holds a live lease, unless `takeOver`. Call every ~15s to stay the tracker. */
  claimTracker(gameId: Uuid, opts?: { takeOver?: boolean }): Promise<GameTracker>
  /** Hand the game back so another parent can start tracking straight away. */
  releaseTracker(gameId: Uuid): Promise<void>
  /** Fires when anyone claims or releases a game on the active team (so a takeover shows up immediately). */
  onTrackerChange(cb: () => void): () => void

  /** Subscribe to any change (local or remote) so UIs refresh. Returns unsubscribe. */
  subscribe(cb: () => void): () => void
  onSyncState(cb: (s: SyncState, pending: number) => void): () => void
}
