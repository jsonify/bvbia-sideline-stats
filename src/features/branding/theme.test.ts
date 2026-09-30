import { describe, expect, it } from 'vitest'
import { applyBranding, contrast, DEFAULT_BRANDING, normalize, themeVars } from './theme'

describe('theme', () => {
  it('defaults to Dortmund yellow', () => {
    expect(DEFAULT_BRANDING.accent).toBe('#FDE100')
    expect(normalize(null)).toMatchObject({ accent: '#FDE100', appearance: 'system', logo: null })
    expect(normalize({ accent: 'nope' }).accent).toBe('#FDE100')
  })
  it('puts black ink on yellow and keeps accent text readable', () => {
    const light = themeVars('#FDE100', false)
    expect(light['--brand-ink']).toBe('#000000')
    expect(contrast(light['--brand-text'], '#ffffff')).toBeGreaterThanOrEqual(4.5) // yellow text on white falls back to black
    const dark = themeVars('#FDE100', true)
    expect(dark['--brand-text']).toBe('#FDE100')
  })
  it('uses white ink on dark accents', () => {
    expect(themeVars('#1E40AF', false)['--brand-ink']).toBe('#ffffff')
  })
  it('applies appearance and custom accent to the document, and clears it for the default', () => {
    const root = document.createElement('div')
    applyBranding({ accent: '#E11D2A', appearance: 'dark' }, root)
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.style.getPropertyValue('--brand')).toBe('#E11D2A')
    applyBranding({ accent: '#FDE100', appearance: 'system' }, root)
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(root.style.getPropertyValue('--brand')).toBe('')
  })
})
