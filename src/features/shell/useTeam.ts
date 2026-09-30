import { useEffect, useState } from 'react'
import { useRepo } from '../../data/context'
import type { Team } from '../../types'

/** The active team. undefined while loading, null when this device has no team yet. Follows team switches. */
export function useTeam(): { team: Team | null | undefined; reload: () => void } {
  const repo = useRepo()
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    repo.getTeam().then((t) => alive && setTeam((cur) => (JSON.stringify(cur) === JSON.stringify(t) ? cur : t)), () => alive && setTeam(null))
    return () => { alive = false }
  }, [repo, tick])
  useEffect(() => repo.subscribe(() => setTick((n) => n + 1)), [repo])
  return { team, reload: () => setTick((n) => n + 1) }
}
