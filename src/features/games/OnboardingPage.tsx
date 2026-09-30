import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRepo } from '../../data/context'
import { JoinCodeCard } from '../shell/JoinCodeCard'
import type { Team } from '../../types'
import '../shell/shell.css'
import './games.css'

type Step = 'choose' | 'create' | 'join' | 'created'

export default function OnboardingPage() {
  const repo = useRepo()
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('choose')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [team, setTeam] = useState<Team | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = value.trim()
    if (!v) { setError(step === 'create' ? 'Give your team a name.' : 'Enter the team code.'); return }
    setBusy(true); setError('')
    try {
      if (step === 'create') { setTeam(await repo.createTeam(v)); setStep('created') }
      else { await repo.joinTeam(v.toUpperCase()); nav('/', { replace: true }) }
    } catch (err) {
      setError(step === 'join' ? "We couldn't find that code. Check it with the parent who shared it." : (err as Error).message || 'Something went wrong. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <main className="gm-welcome">
      {step === 'choose' && (
        <>
          <div className="ss-eyebrow">Sideline Stats</div>
          <h1>Track the game. Cheer louder.</h1>
          <p className="lead">Tally duels, first touches and box entries for the whole team in one tap, right from the sideline. Every parent sees the same numbers.</p>
          <div className="gm-paths">
            <button className="ss-card gm-path" onClick={() => setStep('create')}><strong>Create my team</strong><span>I'm the first parent here. Set up our team.</span></button>
            <button className="ss-card gm-path" onClick={() => setStep('join')}><strong>Join with team code</strong><span>Another parent already set us up.</span></button>
          </div>
        </>
      )}
      {(step === 'create' || step === 'join') && (
        <form onSubmit={submit} noValidate>
          <button type="button" className="gm-back ss-icon-btn" style={{ width: 'auto', background: 'none' }} onClick={() => { setStep('choose'); setError(''); setValue('') }}>‹ Back</button>
          <h1>{step === 'create' ? "What's your team called?" : 'Enter your team code'}</h1>
          <p className="lead">{step === 'create' ? "Something the parents will recognize, like “U10 Thunder”." : 'Ask a parent who already tracks games for the code. It shows on their Team tab.'}</p>
          <div className="ss-field">
            <label className="ss-label" htmlFor="ob-input">{step === 'create' ? 'Team name' : 'Team code'}</label>
            <input id="ob-input" className="ss-input" value={value} autoFocus autoComplete="off"
              autoCapitalize={step === 'join' ? 'characters' : 'words'} enterKeyHint="go"
              aria-invalid={!!error} aria-describedby={error ? 'ob-err' : undefined}
              onChange={(e) => { setValue(e.target.value); setError('') }} />
            {error && <div id="ob-err" className="ss-error" role="alert">{error}</div>}
          </div>
          <button className="ss-btn ss-btn-primary ss-btn-big" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'One moment…' : step === 'create' ? 'Create team' : 'Join team'}
          </button>
        </form>
      )}
      {step === 'created' && team && (
        <>
          <h1>You're all set!</h1>
          <p className="lead">Share this code so other parents can help track games for {team.name}.</p>
          <JoinCodeCard teamName={team.name} code={team.joinCode} />
          <button className="ss-btn ss-btn-primary ss-btn-big" style={{ width: '100%', marginTop: 16 }} onClick={() => nav('/', { replace: true })}>Let's go</button>
        </>
      )}
    </main>
  )
}
