import { useEffect, useState } from 'react'
import { useRepo } from '../../data/context'
import type { Team } from '../../types'

/** team === undefined while loading, null when this device has no team yet. */
export function useTeam(): { team: Team | null | undefined; reload: () => void } {
  const repo = useRepo()
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    repo.getTeam().then((t) => alive && setTeam(t), () => alive && setTeam(null))
    return () => { alive = false }
  }, [repo, tick])
  return { team, reload: () => setTick((n) => n + 1) }
}
