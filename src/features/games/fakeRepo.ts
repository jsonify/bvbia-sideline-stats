import type { Repository } from '../../data/repository'
import type { Game, Team } from '../../types'

/** In-memory Repository for tests. */
export function makeFakeRepo(team: Team | null = null): Repository & { games: Game[] } {
  const games: Game[] = []
  return {
    games,
    getTeam: async () => team,
    createTeam: async (name) => (team = { id: 't1', name, joinCode: 'ABC123' }),
    joinTeam: async (code) => (team = { id: 't1', name: 'Joined', joinCode: code }),
    saveBranding: async (branding) => (team = { ...(team as Team), branding }),
    listGames: async () => games,
    getGame: async (id) => games.find((g) => g.id === id) ?? null,
    saveGame: async (g) => {
      const full: Game = { teamId: 't1', createdAt: 'x', updatedAt: 'x', ...g, id: g.id ?? `g${games.length + 1}` }
      games.push(full)
      return full
    },
    deleteGame: async () => {},
    listEvents: async () => [],
    listAllEvents: async () => [],
    addEvent: async () => { throw new Error('unused') },
    undoEvent: async () => {},
    subscribe: () => () => {},
    onSyncState: () => () => {},
  }
}
