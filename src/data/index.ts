// Data-layer agent replaces this with the real factory (Supabase + offline cache, local fallback).
import type { Repository } from './repository'
export function createRepository(): Repository {
  throw new Error('createRepository not implemented yet')
}
