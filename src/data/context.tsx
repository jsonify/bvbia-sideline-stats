import { createContext, useContext } from 'react'
import type { Repository } from './repository'

export const RepoContext = createContext<Repository | null>(null)
export function useRepo(): Repository {
  const r = useContext(RepoContext)
  if (!r) throw new Error('RepoContext missing')
  return r
}
