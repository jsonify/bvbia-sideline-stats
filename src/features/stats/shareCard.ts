import type { Game, StatCategory, StatEvent, Team, TeamGoals } from '../../types'
import { summarize } from '../../lib/summary'
import { fmtPct } from '../../lib/export'
import { goalStatus } from '../../lib/goals'
import { cleanScore, resultOf, RESULT_WORD, type Result } from '../../lib/score'
import { periodBreakdown, periodLabel, POSITIVE } from './insights'
import { BOX_H, BOX_W, PITCH_H, PITCH_W, placeEvents } from './fieldPlacement'
import { COUNT_OF, pctOf } from './trends'

// The summary as a picture, for the team chat. Drawn on a canvas so it needs no library and works offline.
// It is always drawn light (whatever the app's theme) so it reads the same on every phone it is sent to.

export const CARD_W = 1080
export const CARD_H = 1350

const INK = '#16181d', MUTED = '#5f6672', LINE = '#dde1e7', GOOD = '#15803d', PAPER = '#ffffff'
const COLOR: Record<StatCategory, string> = { duel: '#2a78d6', first_contact: '#eb6834', box_entry: '#1baf7a' }
const DISPLAY = '"Barlow Condensed","Arial Narrow",system-ui,sans-serif'
const BODY = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'

const STATS: { cat: StatCategory; label: string; unit: string }[] = [
  { cat: 'duel', label: '1v1s won', unit: '1v1s' },
  { cat: 'first_contact', label: 'Clean first contact', unit: 'balls' },
  { cat: 'box_entry', label: 'Entries with a shot', unit: 'entries' },
]
const RESULT_COLOR: Record<Result, string> = { W: GOOD, D: '#5f6672', L: '#b91c1c' }
const BANNER_H = 84, BANNER_GAP = 12 // final score banner under the header, when the game has a score
const COL_X = [250, 560, 870] // centre of each stat's column

export interface CardInput {
  game: Pick<Game, 'opponent' | 'date' | 'home' | 'status' | 'periods' | 'location' | 'score'>
  events: StatEvent[]
  team?: Pick<Team, 'name' | 'branding'> | null
  goals?: TeamGoals
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Largest font size (down to `min`) at which `text` fits in `width`. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, min: number, width: number) {
  let px = max
  for (; px > min; px -= 2) { ctx.font = font(px); if (ctx.measureText(text).width <= width) break }
  ctx.font = font(px)
  return px
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > width) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

function gauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pct: number | null, goal: number | undefined, color: string) {
  ctx.lineCap = 'round'
  ctx.lineWidth = 26
  ctx.strokeStyle = LINE
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke()
  if (pct) {
    ctx.strokeStyle = color
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * Math.min(pct, 100) / 100); ctx.stroke()
  }
  if (goal !== undefined) {
    const a = Math.PI * (1 + goal / 100)
    ctx.lineWidth = 6; ctx.strokeStyle = INK
    ctx.beginPath()
    ctx.moveTo(cx + (r - 24) * Math.cos(a), cy + (r - 24) * Math.sin(a))
    ctx.lineTo(cx + (r + 22) * Math.cos(a), cy + (r + 22) * Math.sin(a))
    ctx.stroke()
  }
}

function pitch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, events: StatEvent[]) {
  const X = (m: number) => x + m * s, Y = (m: number) => y + m * s
  ctx.fillStyle = '#edf8f3'
  ctx.fillRect(X(0), Y(0), PITCH_W * s, PITCH_H * s)
  ctx.strokeStyle = '#9aa6a0'; ctx.lineWidth = 2.5
  const box = (bx: number, by: number, w: number, h: number) => ctx.strokeRect(X(bx), Y(by), w * s, h * s)
  box(0, 0, PITCH_W, PITCH_H)
  ctx.beginPath(); ctx.moveTo(X(PITCH_W / 2), Y(0)); ctx.lineTo(X(PITCH_W / 2), Y(PITCH_H)); ctx.stroke()
  ctx.beginPath(); ctx.arc(X(PITCH_W / 2), Y(PITCH_H / 2), 9.15 * s, 0, Math.PI * 2); ctx.stroke()
  box(0, (PITCH_H - BOX_H) / 2, BOX_W, BOX_H)
  box(PITCH_W - BOX_W, (PITCH_H - BOX_H) / 2, BOX_W, BOX_H)
  box(0, (PITCH_H - 18.32) / 2, 5.5, 18.32)
  box(PITCH_W - 5.5, (PITCH_H - 18.32) / 2, 5.5, 18.32)

  const d = 2.4 * s
  for (const p of placeEvents(events)) {
    const c = COLOR[p.event.category], good = POSITIVE.has(p.event.outcome)
    ctx.save()
    ctx.translate(X(p.x), Y(p.y))
    ctx.beginPath()
    if (p.event.category === 'duel') ctx.arc(0, 0, d, 0, Math.PI * 2)
    else if (p.event.category === 'first_contact') { ctx.rotate(Math.PI / 4); ctx.rect(-d * 0.85, -d * 0.85, d * 1.7, d * 1.7) }
    else ctx.rect(-d * 0.85, -d * 0.85, d * 1.7, d * 1.7)
    ctx.fillStyle = good ? c : PAPER; ctx.fill()
    ctx.lineWidth = 3; ctx.strokeStyle = c; ctx.stroke()
    ctx.restore()
  }
}

/** Draw the summary card. Null when this browser can't draw (no canvas). */
export async function drawShareCard(input: CardInput, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement | null> {
  const { game, team, goals = {} } = input
  const live = input.events.filter((e) => !e.deletedAt)
  const s = summarize(live)
  canvas.width = CARD_W; canvas.height = CARD_H
  let ctx: CanvasRenderingContext2D | null = null
  try { ctx = canvas.getContext('2d') } catch { /* no canvas support */ }
  if (!ctx) return null
  try { await document.fonts?.load(`800 80px ${DISPLAY}`) } catch { /* fall back to the next font */ }
  const logo = team?.branding?.logo ? await loadImage(team.branding.logo) : null

  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = team?.branding?.accent ?? '#16181d'
  ctx.fillRect(0, 0, CARD_W, 18)
  ctx.textBaseline = 'alphabetic'

  // Header: team, opponent, date.
  let left = 60
  if (logo) {
    const h = 110, w = Math.min(160, (logo.width / logo.height) * h)
    ctx.drawImage(logo, 60, 60, w, h)
    left = 60 + w + 28
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = MUTED; ctx.font = `600 32px ${BODY}`
  ctx.fillText(ellipsize(ctx, team?.name ?? 'Game summary', CARD_W - left - 60), left, 92)
  const title = `${game.home ? 'vs' : '@'} ${game.opponent}`.toUpperCase()
  ctx.fillStyle = INK
  fit(ctx, title, (px) => `800 ${px}px ${DISPLAY}`, 92, 48, CARD_W - left - 60)
  ctx.fillText(ellipsize(ctx, title, CARD_W - left - 60), left, 172)
  const date = new Date(game.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const state = game.status === 'final' ? 'Final' : game.status === 'live' ? 'In progress' : 'Scheduled'
  ctx.fillStyle = MUTED; ctx.font = `500 30px ${BODY}`
  ctx.fillText(ellipsize(ctx, [date, game.location, state].filter(Boolean).join(' · '), CARD_W - 120), 60, 232)

  // Final score banner. Everything below moves down to make room, so a game without a score keeps the old layout.
  const score = cleanScore(game.score), result = resultOf(game)
  const off = score && result ? BANNER_H + BANNER_GAP : 0
  if (score && result) {
    const by = 262, bx = 60, bw = CARD_W - 120
    ctx.fillStyle = RESULT_COLOR[result]
    const r = 16
    ctx.beginPath()
    ctx.moveTo(bx + r, by); ctx.arcTo(bx + bw, by, bx + bw, by + BANNER_H, r); ctx.arcTo(bx + bw, by + BANNER_H, bx, by + BANNER_H, r)
    ctx.arcTo(bx, by + BANNER_H, bx, by, r); ctx.arcTo(bx, by, bx + bw, by, r); ctx.closePath(); ctx.fill()
    ctx.fillStyle = PAPER; ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'; ctx.font = `700 30px ${BODY}`
    ctx.fillText(`${game.status === 'final' ? 'FINAL' : 'SCORE'} · ${RESULT_WORD[result].toUpperCase()}`, bx + 32, by + BANNER_H / 2)
    ctx.textAlign = 'right'; ctx.font = `800 68px ${DISPLAY}`
    ctx.fillText(`${score.us} – ${score.them}`, bx + bw - 32, by + BANNER_H / 2 + 2)
    ctx.textBaseline = 'alphabetic'
  }

  // Three gauges.
  ctx.textAlign = 'center'
  STATS.forEach((st, i) => {
    const n = COUNT_OF[st.cat](s), pct = pctOf(n), cx = COL_X[i], cy = 450 + off
    gauge(ctx!, cx, cy, 112, pct, goals[st.cat], COLOR[st.cat])
    ctx!.fillStyle = INK; ctx!.font = `800 92px ${DISPLAY}`
    ctx!.fillText(fmtPct(pct), cx, cy - 4)
    ctx!.font = `700 30px ${BODY}`
    ctx!.fillText(st.label, cx, cy + 56)
    ctx!.fillStyle = MUTED; ctx!.font = `500 26px ${BODY}`
    ctx!.fillText(n.d === 0 ? `No ${st.unit} yet` : `${n.n} of ${n.d} ${st.unit}`, cx, cy + 92)
    const gs = goalStatus(pct, goals[st.cat])
    if (goals[st.cat] !== undefined) {
      ctx!.fillStyle = gs?.met ? GOOD : MUTED; ctx!.font = `700 24px ${BODY}`
      ctx!.fillText(gs ? `${gs.met ? '✓ ' : ''}${gs.text}` : `Target ${goals[st.cat]}%`, cx, cy + 126)
    }
  })

  // One row per period.
  const periods = periodBreakdown(live, game.periods)
  let y = 640 + off
  ctx.strokeStyle = LINE; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(CARD_W - 60, y); ctx.stroke()
  y += 50
  for (const p of periods) {
    const ps = summarize(live.filter((e) => e.period === p))
    ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = `700 26px ${BODY}`
    ctx.fillText(periodLabel(p, game.periods), 60, y)
    ctx.textAlign = 'center'
    STATS.forEach((st, i) => {
      const n = COUNT_OF[st.cat](ps)
      ctx!.fillStyle = INK; ctx!.font = `800 40px ${DISPLAY}`
      if (n.d === 0) { ctx!.textAlign = 'center'; ctx!.fillText('—', COL_X[i], y + 2); return }
      // The percentage ends just right of the column's centre and the count starts after it, so 100% never runs into 3/3.
      ctx!.textAlign = 'right'; ctx!.fillText(fmtPct(pctOf(n)), COL_X[i] + 16, y + 2)
      ctx!.fillStyle = MUTED; ctx!.font = `500 22px ${BODY}`; ctx!.textAlign = 'left'; ctx!.fillText(`${n.n}/${n.d}`, COL_X[i] + 26, y)
    })
    y += 50
  }

  // The game map fills what is left above the footer.
  const top = y + 10, bottom = CARD_H - 90
  const scale = Math.min((CARD_W - 120) / PITCH_W, (bottom - top - 40) / PITCH_H)
  const mapW = PITCH_W * scale, mx = (CARD_W - mapW) / 2
  ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = `600 22px ${BODY}`
  ctx.fillText('Defending end', mx, top + 22)
  ctx.textAlign = 'right'
  ctx.fillText('Attacking end →', mx + mapW, top + 22)
  pitch(ctx, mx, top + 36, scale, live)

  ctx.textAlign = 'center'; ctx.fillStyle = MUTED; ctx.font = `500 22px ${BODY}`
  ctx.fillText('Dots show what happened, not where (positions are simulated). Filled = good outcome.', CARD_W / 2, CARD_H - 58)
  ctx.font = `700 24px ${BODY}`; ctx.fillStyle = INK
  ctx.fillText('Sideline Stats', CARD_W / 2, CARD_H - 24)
  return canvas
}

export const cardBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => { try { canvas.toBlob((b) => resolve(b), 'image/png') } catch { resolve(null) } })
