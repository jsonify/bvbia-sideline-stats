import { useEffect, useState } from 'react'
import { useRepo } from '../../data/context'
import type { SyncState } from '../../data/repository'

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

