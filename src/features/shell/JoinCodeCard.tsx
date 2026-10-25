import { useContext, useEffect, useState } from 'react'
import { RepoContext } from '../../data/context'
import { announceMessage, INVITE_STEPS, inviteLink, inviteMessage } from '../../lib/invite'
import { gameToAnnounce, todayISO } from '../../lib/schedule'

export async function shareOrCopy(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled' // they closed the share sheet: not an error
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/** The opponent in the game to announce (live now, or next up), kept current. Null without a game or a repository. */
function useOpponentToAnnounce(): string | null {
  const repo = useContext(RepoContext)
  const [opponent, setOpponent] = useState<string | null>(null)
  useEffect(() => {
    if (!repo) return
    let live = true
    const load = () => { repo.listGames().then((gs) => { if (live) setOpponent(gameToAnnounce(gs, todayISO())?.opponent ?? null) }, () => {}) }
    load()
    const off = repo.subscribe(load)
    return () => { live = false; off() }
  }, [repo])
  return opponent
}

export function JoinCodeCard({ teamName, code }: { teamName: string; code: string }) {
  const [msg, setMsg] = useState('')
  const link = inviteLink(code)
  const opponent = useOpponentToAnnounce()
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }
  return (
    <div className="ss-code-card">
      <div className="ss-eyebrow">Team code</div>
      <div className="ss-code" aria-label={`Team code ${code.split('').join(' ')}`}>{code}</div>
      <div className="ss-row">
        <button type="button" className="ss-btn ss-btn-primary" onClick={async () => {
          const r = await shareOrCopy('Sideline Stats', inviteMessage(teamName, code, link))
          if (r === 'copied') flash('Invite copied. Paste it into a text or chat.')
          else if (r === 'failed') flash('Could not share. Copy the code and link by hand instead.')
        }}>Share code</button>
        <button type="button" className="ss-btn" onClick={async () => {
          try { await navigator.clipboard.writeText(code); flash('Code copied') } catch { flash('Could not copy') }
        }}>Copy code</button>
      </div>
      <div className="ss-row">
        <button type="button" className="ss-btn" onClick={async () => {
          const r = await shareOrCopy('Sideline Stats', announceMessage(opponent, link))
          if (r === 'copied') flash('Announcement copied. Paste it into the families\' chat.')
          else if (r === 'failed') flash('Could not share. Copy the link below by hand instead.')
        }}>Share announcement</button>
      </div>
      <div className="ss-hint" role="status" aria-live="polite">{msg || `Share code sends the app link, the code and the steps to join. Share announcement sends families a short note with the link to follow ${opponent ? `the game against ${opponent}` : 'our games'}.`}</div>
      <div className="ss-invite">
        <div className="ss-eyebrow">How other parents join</div>
        <ol className="ss-invite-steps">{INVITE_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="ss-invite-link" aria-label="Invite link">{link}</div>
      </div>
    </div>
  )
}
