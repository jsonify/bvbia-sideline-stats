// "Use my location" for the game form: GPS fix → a short place name via OpenStreetMap's reverse geocoder.
// If the lookup fails (offline at the field, rate-limited) we still fill in the coordinates, which maps apps understand.

interface NominatimAddress {
  road?: string; house_number?: string; city?: string; town?: string; village?: string; suburb?: string; hamlet?: string
}
export interface NominatimPlace { name?: string; address?: NominatimAddress }

export function formatPlace(p: NominatimPlace): string {
  const a = p.address ?? {}
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb
  const head = p.name?.trim() || street
  return [head, city].filter((s, i, all) => s && all.indexOf(s) === i).join(', ')
}

export const formatCoords = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`

export class LocateError extends Error {}

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new LocateError('This device can’t share its location.')); return }
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new LocateError(
      e.code === e.PERMISSION_DENIED ? 'Location is turned off for this app. Allow it in your settings, or type the field name.'
        : 'Couldn’t get a GPS fix. Try again, or type the field name.',
    )), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
  })
}

export async function locateField(fetchImpl: typeof fetch = fetch): Promise<string> {
  const { latitude: lat, longitude: lon } = (await position()).coords
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}`
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const place = formatPlace(await res.json())
      if (place) return place
    }
  } catch { /* fall through to coordinates */ }
  return formatCoords(lat, lon)
}
