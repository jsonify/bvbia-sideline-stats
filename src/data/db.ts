import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Game, StatEvent } from '../types'
import type { QueueOp, QueueStore } from './queue'

export type GameRec = Game & { deletedAt?: string | null }

interface Schema extends DBSchema {
  kv: { key: string; value: unknown }
  games: { key: string; value: GameRec }
  events: { key: string; value: StatEvent; indexes: { byGame: string } }
  queue: { key: number; value: QueueOp }
}

export type LocalDB = IDBPDatabase<Schema>

export function openLocalDB(name = 'sideline-stats'): Promise<LocalDB> {
  return openDB<Schema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('kv')
      db.createObjectStore('games', { keyPath: 'id' })
      db.createObjectStore('events', { keyPath: 'id' }).createIndex('byGame', 'gameId')
      db.createObjectStore('queue', { autoIncrement: true })
    },
  })
}

export function idbQueueStore(db: LocalDB): QueueStore {
  return {
    async all() {
      const tx = db.transaction('queue')
      const keys = await tx.store.getAllKeys()
      const vals = await tx.store.getAll()
      return keys.map((key, i) => ({ key, op: vals[i] }))
    },
    async add(op) { await db.add('queue', op) },
    async remove(key) { await db.delete('queue', key) },
  }
}

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 3) | 8).toString(16)
      })
