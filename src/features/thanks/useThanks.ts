import { useEffect } from 'react'
import { useRepo } from '../../data/context'
import { useRemembered } from '../../data/remember'
import type { GameThanks } from '../../data/repository'

/** Every heart on the team's games, kept current as hearts are given and taken back (on this phone or another). */
export function useThanks(): GameThanks[] {
  const repo = useRepo()
  const [all, setAll] = useRemembered<GameThanks[]>(repo, 'thanks', [])
  useEffect(() => {
    let live = true
    const load = () => { repo.listThanks().then((l) => { if (live) setAll(l) }, () => {}) }
    load()
    const off = repo.subscribe(load)
    return () => { live = false; off() }
  }, [repo, setAll])
  return all
}
