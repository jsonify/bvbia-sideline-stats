import { useState } from 'react'

export async function shareOrCopy(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function JoinCodeCard({ teamName, code }: { teamName: string; code: string }) {
  const [msg, setMsg] = useState('')
  const message = `Join ${teamName} on Sideline Stats with team code ${code}`
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  return (
    <div className="ss-code-card">
      <div className="ss-eyebrow">Team code</div>
      <div className="ss-code" aria-label={`Team code ${code.split('').join(' ')}`}>{code}</div>
      <div className="ss-row">
        <button type="button" className="ss-btn ss-btn-primary" onClick={async () => {
          const r = await shareOrCopy('Sideline Stats', message)
          if (r === 'copied') flash('Copied to clipboard')
          else if (r === 'failed') flash('Could not share — copy the code manually')
        }}>Share code</button>
        <button type="button" className="ss-btn" onClick={async () => {
          try { await navigator.clipboard.writeText(code); flash('Code copied') } catch { flash('Could not copy') }
        }}>Copy</button>
      </div>
      <div className="ss-hint" role="status" aria-live="polite">{msg || 'Other parents enter this code to track with you.'}</div>
    </div>
  )
}
