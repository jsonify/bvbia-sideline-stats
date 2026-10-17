import { useEffect, useState } from 'react'
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../../lib/pwa'

/**
 * "Add to Home Screen" for parents still using the app in a browser tab. Installed, it opens full screen, keeps saved
 * games safe from the browser's clean-up, and works with no signal. Hidden once installed.
 */
export function InstallCard() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const [installed, setInstalled] = useState(isStandalone)
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), [])
  useEffect(() => {
    const done = () => setInstalled(true)
    window.addEventListener('appinstalled', done)
    return () => window.removeEventListener('appinstalled', done)
  }, [])
  if (installed) return null
  const ios = isIOS()
  if (!canPrompt && !ios) return null // a browser that can't install (or already did): nothing useful to say
  return (
    <section className="ss-card" style={{ marginTop: 16 }}>
      <div className="ss-label">Add to your home screen</div>
      <div className="ss-hint" style={{ marginTop: 0 }}>Opens full screen like an app, works with no signal at the field, and keeps your stats safe on this phone.</div>
      {canPrompt ? (
        <div className="ss-row" style={{ marginTop: 8 }}>
          <button type="button" className="ss-btn ss-btn-primary" onClick={async () => { if (await promptInstall()) setInstalled(true) }}>Install app</button>
        </div>
      ) : (
        <ol className="ss-invite-steps">
          <li>Tap the <strong>Share</strong> button <ShareGlyph /> in Safari</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong>, then open Sideline from your home screen</li>
        </ol>
      )}
    </section>
  )
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="(square with an up arrow)" style={{ display: 'inline-block', verticalAlign: '-3px' }}>
      <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" />
    </svg>
  )
}
