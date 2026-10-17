import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRepo } from '../../data/context'
import { Sheet } from '../../ui/Sheet'

const isTracker = (pathname: string) => /^\/games\/[^/]+\/track$/.test(pathname)

/**
 * Asks for your name when this device has none, so other parents can see who is tracking (and who to ask before taking over).
 * "Not now" puts it off until you open a game's tracker, where it asks again: that is where the name matters.
 */
export function NamePrompt() {
  const repo = useRepo()
  const { pathname } = useLocation()
  const [name, setName] = useState<string | null>(null) // null until read
  const [putOff, setPutOff] = useState<string | null>(null) // the screen "Not now" was tapped on
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  // Read again on every screen, so a name saved in Settings stops the prompt.
  useEffect(() => { let alive = true; void repo.getDisplayName().then((n) => { if (alive) setName(n) }); return () => { alive = false } }, [repo, pathname])

  const open = name === '' && (putOff === null || (isTracker(pathname) && putOff !== pathname))

  return (
    <Sheet open={open} onClose={() => setPutOff(pathname)} title="What's your name?">
      {(close) => (
        <form onSubmit={async (e) => {
          e.preventDefault()
          const n = value.trim().slice(0, 30)
          if (!n) { setError('Enter your name.'); return }
          await repo.setDisplayName(n)
          setName(n)
        }}>
          <p className="ss-hint" style={{ marginTop: 0 }}>Other parents see it when you're tracking a game, so everyone knows who has control and who to ask before taking over.</p>
          <label className="ss-label" htmlFor="np-name">Your name</label>
          <input id="np-name" className="ss-input" value={value} maxLength={30} autoComplete="given-name" enterKeyHint="done"
            placeholder="e.g. Sam" aria-invalid={!!error} aria-describedby={error ? 'np-err' : undefined}
            onChange={(e) => { setValue(e.target.value); setError('') }} />
          {error && <div id="np-err" className="ss-error" role="alert">{error}</div>}
          <div className="ss-row" style={{ marginTop: 12 }}>
            <button type="button" className="ss-btn" onClick={close}>Not now</button>
            <button className="ss-btn ss-btn-primary">Save name</button>
          </div>
          <div className="ss-hint">You can change it any time in Settings.</div>
        </form>
      )}
    </Sheet>
  )
}
