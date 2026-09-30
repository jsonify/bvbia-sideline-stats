import type { Repository } from './repository'
import { LocalRepository, type RepoOptions } from './localRepository'
import { createSupabaseRemote } from './remote'

export const isCloudConfigured = (): boolean =>
  !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

/** Supabase-backed (with offline cache) when env vars are set, otherwise fully local demo mode. */
export function createRepository(opts: RepoOptions = {}): Repository {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const remote = opts.remote !== undefined ? opts.remote : url && key ? createSupabaseRemote(url, key) : null
  return new LocalRepository({ ...opts, remote })
}

export { LocalRepository } from './localRepository'
export type { RepoOptions } from './localRepository'
export { RepoProvider, RepoContext, useRepo } from './context'
export type { Repository, SyncState } from './repository'
