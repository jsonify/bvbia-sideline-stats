import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRepo } from '../../data/context'
import { ConfirmDialog, useToast } from '../../ui'
import type { Team } from '../../types'
import { TeamLogoFor } from '../branding/BrandingProvider'
import '../branding/branding.css'
import '../shell/shell.css'

export default function TeamsPage() {
  const repo = useRepo()
  const nav = useNavigate()
  const toast = useToast()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Team | null>(null)

  const load = useCallback(async () => {
    const [list, active] = await Promise.all([repo.listTeams(), repo.getTeam()])
    setTeams(list); setActiveId(active?.id ?? null)
  }, [repo])
  useEffect(() => { void load(); return repo.subscribe(() => void load()) }, [repo, load])

  async function open(t: Team) {
    if (t.id !== activeId) { await repo.switchTeam(t.id); toast(`Now viewing ${t.name}`, { tone: 'good' }) }
    nav('/')
  }
  async function remove(t: Team) {
    setRemoving(null)
    await repo.leaveTeam(t.id)
    toast(`${t.name} removed from this device`)
  }

  return (
    <main className="ss-page">
      <h1 className="ss-h1">Teams</h1>
      <p className="tm-note">Each team keeps its own games and season stats. Tap a team to switch to it.</p>
      {teams && (
        <ul className="tm-list">
          {teams.map((t) => (
            <li key={t.id} className={'tm-row' + (t.id === activeId ? ' active' : '')}>
              <button type="button" className="tm-main" onClick={() => void open(t)} aria-label={`${t.name}${t.id === activeId ? ', current team' : ', switch to this team'}`}>
                <TeamLogoFor team={t} size={48} />
                <span style={{ minWidth: 0 }}>
                  <div className="tm-name">{t.name}</div>
                  <div className="tm-meta">{t.id === activeId && <span className="tm-active">Viewing</span>}<span>Code {t.joinCode}</span></div>
                </span>
              </button>
              <button type="button" className="tm-remove" onClick={() => setRemoving(t)} aria-label={`Remove ${t.name} from this device`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/welcome?add=1" className="ss-btn ss-btn-primary ss-btn-big tm-add">+ Add or join a team</Link>

      <ConfirmDialog
        open={!!removing} danger title={`Remove ${removing?.name ?? 'team'}?`} confirmLabel="Remove"
        message={<>It disappears from this phone only. The games and stats stay saved in the cloud, and you can bring them back any time with the team code <strong>{removing?.joinCode}</strong>. Write it down first.</>}
        onCancel={() => setRemoving(null)} onConfirm={() => removing && void remove(removing)} />
    </main>
  )
}
