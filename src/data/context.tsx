import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Repository } from './repository'
import { createRepository } from './index'

export const RepoContext = createContext<Repository | null>(null)
export function useRepo(): Repository {
  const r = useContext(RepoContext)
  if (!r) throw new Error('RepoContext missing')
  return r
}

/** Creates the repository once and provides it. Pass `repo` to inject one (tests). */
export function RepoProvider({ children, repo }: { children: ReactNode; repo?: Repository }) {
  const [value] = useState<Repository>(() => repo ?? createRepository())
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>
}
