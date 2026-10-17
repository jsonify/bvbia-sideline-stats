// Browser hooks that make the installed app feel native: install prompt, standalone detection, storage, badge.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` once, early, so it is caught here at startup (before React mounts)
 * and replayed by the install card later. Call once from main.tsx.
 */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep the browser's own mini-infobar out of the way; the Settings card offers it instead
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export const canPromptInstall = () => deferred !== null

/** Shows the browser's install dialog. Resolves true if they installed. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  deferred = null
  notify()
  await e.prompt()
  return (await e.userChoice).outcome === 'accepted'
}

/** Running from the home screen (or as a desktop app window) rather than a browser tab. */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

/** iPhone/iPad Safari, where installing is a manual Share → Add to Home Screen. iPadOS reports itself as a Mac. */
export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/**
 * Ask the browser not to clear this app's saved games when the phone runs low on space. Safari otherwise wipes data
 * for sites not visited in 7 days, which would lose stats that have not synced yet. Granted silently for installed apps.
 */
export async function persistStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch { /* unsupported */ }
}

/** Number on the home-screen icon (stats not yet synced). 0 clears it. */
export function setBadge(count: number) {
  try {
    const n = navigator as any
    if (count > 0) n.setAppBadge?.(count)?.catch?.(() => {})
    else n.clearAppBadge?.()?.catch?.(() => {})
  } catch { /* unsupported */ }
}
