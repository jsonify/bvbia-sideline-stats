// SHARED CONTRACT — the only way UI code touches data. Implemented by the data-layer agent.
import type { Game, NewStatEvent, StatEvent, Team, TeamBranding, Uuid } from '../types'
import type { Lane } from '../lib/lanes'

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'

/**
 * Who is tracking one lane of a game right now. A lane has one tracker at a time, so the same play is never tapped twice.
 *  me     this phone holds the lane
 *  other  another parent holds it (and checked in `idleSeconds` ago)
 *  none   nobody does: never claimed, handed off, or the last tracker went quiet for too long
 */
export interface GameTracker {
  holder: 'me' | 'other' | 'none'
  idleSeconds: number | null
  /** The tracker's chosen name (from their Settings), if they set one. */
  name: string | null
}

/** Every lane of a game and who has it. One phone can hold both (tracking everything) or the phones can split them. */
export type GameLanes = Record<Lane, GameTracker>

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
   * Tracking leases, one per lane. Each lane is tracked by one phone at a time so the same play is never tapped twice,
   * and the lanes can go to different phones (defense on one, offense on another) or both to one.
   * It only coordinates who the UI lets tap: stat events are never rejected, so taps made offline are never lost.
   * These reject when the cloud can't be reached; callers should carry on tracking (offline-first).
   */
  getLanes(gameId: Uuid): Promise<GameLanes>
  /**
   * Start (or keep) tracking these lanes. A lane someone else holds stays theirs unless `takeOver`; the answer says
   * which lanes you ended up with, so asking for both can come back with just one. Call every ~15s to stay the tracker.
   */
  claimLanes(gameId: Uuid, lanes: Lane[], opts?: { takeOver?: boolean }): Promise<GameLanes>
  /** This device's "your name", shown to other parents while you track. Empty = not set. */
  getDisplayName(): Promise<string>
  setDisplayName(name: string): Promise<void>
  /** Hand lanes back (default: all of yours) so another parent can start tracking them straight away. */
  releaseLanes(gameId: Uuid, lanes?: Lane[]): Promise<void>
  /** Fires when anyone claims or releases a lane on the active team (so a takeover shows up immediately). */
  onTrackerChange(cb: () => void): () => void

  /** Subscribe to any change (local or remote) so UIs refresh. Returns unsubscribe. */
  subscribe(cb: () => void): () => void
  onSyncState(cb: (s: SyncState, pending: number) => void): () => void
}
