import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRepo } from '../../data/context'
import type { TeamBranding } from '../../types'
import { applyBranding, cacheBranding, DEFAULT_BRANDING, loadCachedBranding, normalize } from './theme'

interface Ctx { branding: TeamBranding; teamName: string | null }
const BrandingContext = createContext<Ctx>({ branding: DEFAULT_BRANDING, teamName: null })
export const useBranding = () => useContext(BrandingContext)

/** Keeps the document themed with the team's saved branding (from cache instantly, then from the repo). */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const repo = useRepo()
  const [branding, setBranding] = useState<TeamBranding>(loadCachedBranding)
  const [teamName, setTeamName] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => repo.getTeam().then((t) => {
      if (!alive || !t) return
      setTeamName(t.name)
      const b = normalize(t.branding)
      setBranding((cur) => (JSON.stringify(cur) === JSON.stringify(b) ? cur : b))
    }, () => {})
    void load()
    const off = repo.subscribe(() => void load())
    return () => { alive = false; off() }
  }, [repo])

  useEffect(() => {
    applyBranding(branding)
    cacheBranding(branding)
    if (branding.appearance !== 'system' || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyBranding(branding)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [branding])

  const value = useMemo(() => ({ branding, teamName }), [branding, teamName])
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

/** Team logo, or a simple ball mark when none is uploaded. */
export function TeamLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  const { branding, teamName } = useBranding()
  if (branding.logo) return <img className={`bd-logo ${className}`} src={branding.logo} width={size} height={size} alt={teamName ? `${teamName} logo` : 'Team logo'} />
  return (
    <span className={`bd-logo bd-logo-default ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 5l3.5 2.5-1.3 4h-4.4l-1.3-4z" /></svg>
    </span>
  )
}
