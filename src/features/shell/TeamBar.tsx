import { Link } from 'react-router-dom'
import { TeamLogo, useBranding } from '../branding/BrandingProvider'
import '../branding/branding.css'

/** Always-visible reminder of which team's games and stats are on screen; tap to switch teams. */
export function TeamBar() {
  const { teamName } = useBranding()
  if (!teamName) return null
  return (
    <Link to="/teams" className="bd-teambar" aria-label={`Viewing ${teamName}. Switch team`}>
      <span className="bd-teambar-in">
        <TeamLogo size={28} />
        <span className="bd-teambar-name">{teamName}</span>
        <span className="bd-teambar-switch">Switch <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg></span>
      </span>
    </Link>
  )
}
