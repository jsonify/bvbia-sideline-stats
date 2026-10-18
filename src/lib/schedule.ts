import type { Game } from '../types'

/** A kick-off time as "HH:MM" (24 h), or null. Takes Postgres' "HH:MM:SS" too. */
export function cleanKickoff(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null
}

/** "10:30 AM" in the phone's own style. Empty when there is no kick-off time. */
export function kickoffText(v: unknown): string {
  const t = cleanKickoff(v)
  return t ? new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
}

/** Date, then kick-off (a game without a time comes first that day), then when it was added. */
export const bySchedule = (a: Game, b: Game) =>
  a.date.localeCompare(b.date) || (cleanKickoff(a.kickoff) ?? '').localeCompare(cleanKickoff(b.kickoff) ?? '') || a.createdAt.localeCompare(b.createdAt)

/** The same date a week later (for adding the next game of the season). */
export function nextWeek(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + 7)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The whole season in order, one group per month ("October 2026"). */
export function byMonth(games: Game[]): { key: string; label: string; games: Game[] }[] {
  const out: { key: string; label: string; games: Game[] }[] = []
  for (const g of [...games].sort(bySchedule)) {
    const key = g.date.slice(0, 7)
    let group = out[out.length - 1]
    if (!group || group.key !== key) {
      const label = new Date(g.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      out.push(group = { key, label, games: [] })
    }
    group.games.push(g)
  }
  return out
}

/** The next game still to be played: the first scheduled one from today on. */
export const nextGame = (games: Game[], today: string) =>
  games.filter((g) => g.status === 'scheduled' && g.date >= today).sort(bySchedule)[0] ?? null
