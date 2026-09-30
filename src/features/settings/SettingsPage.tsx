import { useTeam } from '../shell/useTeam'
import { JoinCodeCard } from '../shell/JoinCodeCard'
import { YourName } from './YourName'
import { SyncChip } from '../shell/SyncChip'
import { TeamLogo } from '../branding/TeamLogo'
import '../branding/branding.css'
import '../shell/shell.css'

/** Admin for the team you're currently viewing: your name, invite code, sync. Adding/removing teams lives in Teams. */
export default function SettingsPage() {
  const { team } = useTeam()
  return (
    <main className="ss-page">
      <h1 className="ss-h1">Settings</h1>
      {team && (
        <>
          <section className="ss-card ss-team-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <TeamLogo size={64} />
              <div>
                <div className="ss-eyebrow">Settings for</div>
                <div className="ss-team-name">{team.name}</div>
              </div>
            </div>
            <SyncChip />
          </section>
          <YourName />
          <JoinCodeCard teamName={team.name} code={team.joinCode} />
          <p className="st-version">Sideline Stats · stats are saved to the cloud and shared with everyone on this team</p>
        </>
      )}
    </main>
  )
}
