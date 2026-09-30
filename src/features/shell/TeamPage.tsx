import { useEffect, useState } from 'react'
import { useRepo } from '../../data/context'
import type { SyncState } from '../../data/repository'
import { JoinCodeCard } from './JoinCodeCard'
import { useTeam } from './useTeam'
import { BrandingSettings } from '../branding/BrandingSettings'
import { TeamLogo } from '../branding/BrandingProvider'

const syncLabel: Record<SyncState, string> = {
  synced: 'All saved', syncing: 'Syncing…', offline: 'Offline — saving on this phone', error: 'Sync problem — will retry',
}

export function SyncChip() {
  const repo = useRepo()
  const [s, setS] = useState<{ state: SyncState; pending: number }>({ state: 'synced', pending: 0 })
  useEffect(() => repo.onSyncState((state, pending) => setS({ state, pending })), [repo])
  return (
    <span className={`ss-chip ss-sync-${s.state}`} role="status">
      <span className="ss-dot" aria-hidden="true" />
      {syncLabel[s.state]}{s.pending > 0 ? ` (${s.pending} waiting)` : ''}
    </span>
  )
}

export default function TeamPage() {
  const { team } = useTeam()
  return (
    <main className="ss-page">
      <h1 className="ss-h1">Team</h1>
      {team && (
        <>
          <section className="ss-card ss-team-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <TeamLogo size={64} />
              <div>
                <div className="ss-eyebrow">Your team</div>
                <div className="ss-team-name">{team.name}</div>
              </div>
            </div>
            <SyncChip />
          </section>
          <JoinCodeCard teamName={team.name} code={team.joinCode} />
          <BrandingSettings />
        </>
      )}
    </main>
  )
}
