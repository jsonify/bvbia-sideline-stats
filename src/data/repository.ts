// SHARED CONTRACT — the only way UI code touches data. Implemented by the data-layer agent.
import type { Game, NewStatEvent, StatEvent, Team, Uuid } from '../types'

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'

export interface Repository {
  /** Team the current device has joined (null → show onboarding). */
  getTeam(): Promise<Team | null>
  createTeam(name: string): Promise<Team>
  joinTeam(joinCode: string): Promise<Team>

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

  /** Subscribe to any change (local or remote) so UIs refresh. Returns unsubscribe. */
  subscribe(cb: () => void): () => void
  onSyncState(cb: (s: SyncState, pending: number) => void): () => void
}
