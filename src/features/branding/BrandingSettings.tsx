import { useEffect, useRef, useState } from 'react'
import { useRepo } from '../../data/context'
import { useToast } from '../../ui'
import type { TeamBranding } from '../../types'
import { useBranding } from './BrandingProvider'
import { fileToLogoDataUrl } from './image'
import { applyBranding, DEFAULT_BRANDING, isHex, PRESETS } from './theme'
import './branding.css'

const APPEARANCE: { value: TeamBranding['appearance']; label: string }[] = [
  { value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
]

export function BrandingSettings() {
  const repo = useRepo()
  const toast = useToast()
  const { branding: saved } = useBranding()
  const [draft, setDraft] = useState<TeamBranding>(saved)
  const [hexText, setHexText] = useState(saved.accent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // Follow saved changes made elsewhere while the form is clean.
  useEffect(() => { if (!dirty) { setDraft(saved); setHexText(saved.accent) } }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps
  // Live preview while editing; restore the saved look if the user leaves without saving.
  useEffect(() => { applyBranding(draft) }, [draft])
  useEffect(() => () => { applyBranding(JSON.parse(localStorage.getItem('ss-branding') ?? 'null') ?? DEFAULT_BRANDING) }, [])

  const set = (patch: Partial<TeamBranding>) => { setError(null); setDraft((d) => ({ ...d, ...patch })) }
  const setAccent = (hex: string) => { setHexText(hex); if (isHex(hex)) set({ accent: hex.toUpperCase() }) }

  async function onFile(f?: File) {
    if (!f) return
    try { set({ logo: await fileToLogoDataUrl(f) }) } catch (e) { setError((e as Error).message) }
    if (file.current) file.current.value = ''
  }
  async function save() {
    setBusy(true); setError(null)
    try {
      await repo.saveBranding(draft)
      toast('Team look saved for everyone', { tone: 'good' })
    } catch (e) {
      const msg = (e as Error).message
      setError(/fetch|network|offline/i.test(msg) ? "Couldn't save. Check your connection and try again." : msg)
    } finally { setBusy(false) }
  }
  function reset() { setDraft(DEFAULT_BRANDING); setHexText(DEFAULT_BRANDING.accent) }

  return (
    <section className="ss-card bd-settings" aria-labelledby="bd-title">
      <h2 id="bd-title" className="bd-h">Team look</h2>
      <p className="bd-sub">Everyone on the team sees the same logo and colors.</p>

      <div className="bd-block">
        <div className="bd-label">Logo</div>
        <div className="bd-logo-row">
          {draft.logo
            ? <img className="bd-logo-preview" src={draft.logo} alt="Team logo preview" />
            : <div className="bd-logo-preview bd-logo-empty" aria-hidden="true">No logo</div>}
          <div className="bd-logo-actions">
            <button type="button" className="ss-btn" onClick={() => file.current?.click()}>{draft.logo ? 'Change logo' : 'Upload logo'}</button>
            {draft.logo && <button type="button" className="ss-btn bd-ghost" onClick={() => set({ logo: null })}>Remove</button>}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Upload team logo" />
        </div>
      </div>

      <div className="bd-block">
        <div className="bd-label" id="bd-accent">Accent color</div>
        <div className="bd-swatches" role="radiogroup" aria-labelledby="bd-accent">
          {PRESETS.map((p) => (
            <button key={p.hex} type="button" role="radio" aria-checked={draft.accent.toLowerCase() === p.hex.toLowerCase()} aria-label={p.name}
              className="bd-swatch" style={{ background: p.hex }} onClick={() => setAccent(p.hex)} />
          ))}
        </div>
        <div className="bd-custom">
          <input type="color" aria-label="Pick a custom color" value={draft.accent} onChange={(e) => setAccent(e.target.value)} />
          <input className="ss-input" aria-label="Hex color" value={hexText} maxLength={7} spellCheck={false}
            onChange={(e) => setAccent(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)} />
        </div>
        {!isHex(hexText) && <div className="bd-err" role="alert">Use a 6-digit hex color like #FDE100.</div>}
      </div>

      <div className="bd-block">
        <div className="bd-label" id="bd-app">Appearance</div>
        <div className="bd-seg" role="radiogroup" aria-labelledby="bd-app">
          {APPEARANCE.map((a) => (
            <button key={a.value} type="button" role="radio" aria-checked={draft.appearance === a.value} onClick={() => set({ appearance: a.value })}>{a.label}</button>
          ))}
        </div>
        <div className="bd-hint">Auto follows your phone. Light is easiest to read in bright sun.</div>
      </div>

      {error && <div className="bd-err" role="alert">{error}</div>}
      <div className="bd-actions">
        <button type="button" className="ss-btn ss-btn-primary" disabled={!dirty || busy || !isHex(hexText)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save team look'}</button>
        <button type="button" className="ss-btn bd-ghost" onClick={reset} disabled={busy}>Reset to black, white &amp; yellow</button>
      </div>
    </section>
  )
}
