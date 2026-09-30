import type { TeamBranding } from '../../types'

/** Borussia Dortmund yellow on black & white. */
export const DEFAULT_BRANDING: TeamBranding = { accent: '#FDE100', appearance: 'system', logo: null }

export const PRESETS: { name: string; hex: string }[] = [
  { name: 'Dortmund yellow', hex: '#FDE100' },
  { name: 'Gold', hex: '#F5B700' },
  { name: 'Orange', hex: '#FF6B00' },
  { name: 'Red', hex: '#E11D2A' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Purple', hex: '#7C3AED' },
]

export const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s)

type RGB = [number, number, number]
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB
const toHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a), y = toRgb(b)
  return toHex(x.map((v, i) => v + (y[i] - v) * t) as RGB)
}
const lum = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * CSS variable overrides for an accent. `brand` is used for fills (buttons, bars) with `brand-ink` on top;
 * `brand-text` is the accent used as TEXT/icons, falling back to black/white when the accent has too little contrast.
 */
export function themeVars(accent: string, dark: boolean): Record<string, string> {
  const surface = dark ? '#141414' : '#ffffff'
  const fg = dark ? '#ffffff' : '#000000'
  const ink = contrast(accent, '#000000') >= contrast(accent, '#ffffff') ? '#000000' : '#ffffff'
  const brandText = contrast(accent, surface) >= 4.5 ? accent : fg
  return {
    '--brand': accent,
    '--brand-ink': ink,
    '--brand-strong': mix(accent, dark ? '#ffffff' : '#000000', 0.15),
    '--brand-soft': mix(accent, dark ? '#000000' : '#ffffff', dark ? 0.78 : 0.82),
    '--brand-text': brandText,
    '--ring': brandText,
    '--pitch': accent,
  }
}

const KEYS = Object.keys(themeVars('#000000', false))
const CACHE_KEY = 'ss-branding'

export function isDarkNow(b: TeamBranding): boolean {
  if (b.appearance === 'dark') return true
  if (b.appearance === 'light') return false
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Apply colors + appearance to the document. The default accent uses the stylesheet as-is. */
export function applyBranding(b: TeamBranding, root: HTMLElement = document.documentElement) {
  if (b.appearance === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', b.appearance)
  const accent = isHex(b.accent) ? b.accent : DEFAULT_BRANDING.accent
  if (accent.toLowerCase() === DEFAULT_BRANDING.accent.toLowerCase()) KEYS.forEach((k) => root.style.removeProperty(k))
  else Object.entries(themeVars(accent, isDarkNow(b))).forEach(([k, v]) => root.style.setProperty(k, v))
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', isDarkNow(b) ? '#000000' : accent))
}

export function normalize(b?: Partial<TeamBranding> | null): TeamBranding {
  return {
    accent: b?.accent && isHex(b.accent) ? b.accent : DEFAULT_BRANDING.accent,
    appearance: b?.appearance === 'light' || b?.appearance === 'dark' ? b.appearance : 'system',
    logo: b?.logo ?? null,
  }
}

export function loadCachedBranding(): TeamBranding {
  try { return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')) } catch { return DEFAULT_BRANDING }
}
export function cacheBranding(b: TeamBranding) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(b)) } catch { /* private mode / quota */ }
}
