import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatPlace, locateField } from './locate'

const fix = (lat: number, lon: number) => {
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition) } })
}
afterEach(() => vi.unstubAllGlobals())

describe('formatPlace', () => {
  it('prefers the named place, then the town', () => {
    expect(formatPlace({ name: 'Magnuson Park', address: { road: 'NE 65th St', city: 'Seattle' } })).toBe('Magnuson Park, Seattle')
  })
  it('falls back to the street address', () => {
    expect(formatPlace({ name: '', address: { house_number: '7400', road: 'Sand Point Way NE', city: 'Seattle' } })).toBe('7400 Sand Point Way NE, Seattle')
  })
  it('is empty when there is nothing useful', () => {
    expect(formatPlace({})).toBe('')
  })
})

describe('locateField', () => {
  it('returns the reverse-geocoded place name', async () => {
    fix(47.68, -122.25)
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Magnuson Park', address: { city: 'Seattle' } }) })
    expect(await locateField(f as unknown as typeof fetch)).toBe('Magnuson Park, Seattle')
    expect(f.mock.calls[0][0]).toContain('lat=47.68&lon=-122.25')
  })
  it('falls back to coordinates when the lookup fails', async () => {
    fix(47.681234, -122.251234)
    const f = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await locateField(f as unknown as typeof fetch)).toBe('47.68123, -122.25123')
  })
  it('explains a denied permission', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_: unknown, fail: PositionErrorCallback) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError) } })
    await expect(locateField()).rejects.toThrow(/Allow it in your settings/)
  })
})
