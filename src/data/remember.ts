import { useCallback, useState } from 'react'
import type { Repository } from './repository'

/**
 * Remembers what each screen last showed, so a screen that is built again (you went back to it, or switched tabs) paints at
 * once with that and then refreshes, instead of sitting empty while it loads. Everything is forgotten when the active team
 * changes, so one team's games are never shown under another.
 */
interface Slot { teamId: string | null | undefined; data: Map<string, unknown> }
const slots = new WeakMap<Repository, Slot>()
const slotOf = (repo: Repository): Slot => {
  let s = slots.get(repo)
  if (!s) { s = { teamId: undefined, data: new Map() }; slots.set(repo, s) }
  return s
}

/** Tell the memory which team is active. A different team empties it. */
export function rememberTeam(repo: Repository, teamId: string | null) {
  const s = slotOf(repo)
  if (s.teamId !== undefined && s.teamId !== teamId) s.data.clear()
  s.teamId = teamId
}

export const recall = <T,>(repo: Repository, key: string): T | undefined => slotOf(repo).data.get(key) as T | undefined
// An empty list is never remembered: showing "no games yet" for a moment and then the real games is worse than a short load.
const isEmpty = (v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0)
export const remember = (repo: Repository, key: string, value: unknown) => {
  const data = slotOf(repo).data
  if (isEmpty(value)) data.delete(key)
  else data.set(key, value)
}

/** useState whose first value is whatever this key last held, and whose updates are remembered for next time. */
export function useRemembered<T>(repo: Repository, key: string, initial: T): [T, (v: T) => void] {
  const [value, set] = useState<T>(() => recall<T>(repo, key) ?? initial)
  const setAndRemember = useCallback((v: T) => { remember(repo, key, v); set(v) }, [repo, key])
  return [value, setAndRemember]
}
