import { useEffect, useState } from 'react'
import { useRepo } from '../../data/context'

/** Optional name shown to other parents while you track ("Sam is tracking this game"). Stored on this device. */
export function YourName() {
  const repo = useRepo()
  const [saved, setSaved] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { void repo.getDisplayName().then((n) => { setSaved(n); setValue(n) }) }, [repo])
  if (saved === null) return null
  const dirty = value.trim() !== saved
  return (
    <form className="ss-card" style={{ marginTop: 16 }} onSubmit={async (e) => {
      e.preventDefault()
      const n = value.trim().slice(0, 30)
      await repo.setDisplayName(n)
      setSaved(n); setValue(n); setMsg(n ? 'Saved' : 'Name removed')
      setTimeout(() => setMsg(''), 2500)
    }}>
      <label className="ss-label" htmlFor="your-name">Your name</label>
      <input id="your-name" className="ss-input" value={value} maxLength={30} autoComplete="given-name" enterKeyHint="done"
        placeholder="e.g. Sam" onChange={(e) => setValue(e.target.value)} />
      <div className="ss-hint">Other parents see it when you're tracking a game, so they know who to ask before taking over.</div>
      <div className="ss-row" style={{ marginTop: 8, alignItems: 'center' }}>
        <button className="ss-btn ss-btn-primary" disabled={!dirty}>Save name</button>
        <span role="status" aria-live="polite" className="ss-hint" style={{ margin: 0 }}>{msg}</span>
      </div>
    </form>
  )
}
