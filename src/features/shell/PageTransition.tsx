import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { TeamBar } from './TeamBar'
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, usePresenceData, type Variants } from 'motion/react'

/** How deep a screen is in the app: tabs are 0, a game's summary / new-game form 1, its tracker / editor 2. */
export function depthOf(pathname: string): number {
  if (/^\/games\/[^/]+\/(track|edit)$/.test(pathname)) return 2
  if (/^\/games\//.test(pathname)) return 1
  return 0
}

/** Full-screen working screens (live tracker, forms) have no tab bar or team bar. */
export const hidesNav = (pathname: string) => /\/track$|\/edit$|^\/games\/new$/.test(pathname)

/** Where "back" goes when there is nothing in the history to go back to (a deep link, a refreshed page). */
export function parentOf(pathname: string): string {
  const m = pathname.match(/^\/games\/([^/]+)\/(track|edit)$/)
  return m ? `/games/${m[1]}` : '/'
}

const UNDER = '-28%' // the page underneath only moves a little, like iOS
const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 1 } as const
const FADE = { duration: 0.16, ease: 'easeOut' } as const

// direction: 1 = push (go deeper), -1 = pop (go back), 0 = same level (tabs): a quick cross-fade
const variants: Variants = {
  enter: (d: number) => (d === 1 ? { x: '100%' } : d === -1 ? { x: UNDER } : { opacity: 0 }),
  center: (d: number) => ({ x: 0, opacity: 1, transition: d === 0 ? FADE : SPRING }),
  exit: (d: number) => (d === 1 ? { x: UNDER, transition: SPRING } : d === -1 ? { x: '100%', transition: SPRING } : { opacity: 0, transition: FADE }),
}

// Going back by swiping: it may begin this close to the left edge, is recognised once the finger has clearly moved sideways,
// and lets go if the page was pulled a fifth of the way across or flicked even gently.
const SWIPE_ZONE = 48 // px from the left edge
const SWIPE_START = 8 // px of sideways movement before it counts as a swipe
const SWIPE_FRACTION = 0.2
const SWIPE_FLICK = 250 // px per second

const scrollOf = new Map<string, number>() // scroll position each screen was left at, so "back" lands where you were

/** `ref` is forwarded because AnimatePresence (popLayout) needs it to lift the outgoing screen out of the page flow. */
interface LayerProps { path: string; depth: number; children: ReactNode; ref?: Ref<HTMLDivElement> }

function Layer({ path, depth, children, ref }: LayerProps) {
  const present = useIsPresent()
  const dir = (usePresenceData() as number | undefined) ?? 0
  const el = useRef<HTMLDivElement | null>(null)
  const setRef = useCallback((node: HTMLDivElement | null) => {
    el.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])
  const x = useMotionValue(0)
  const navigate = useNavigate()

  // The page is being replaced: freeze it where it was scrolled, since the window itself scrolls back to the top for the new page.
  useLayoutEffect(() => {
    if (present) return
    const y = window.scrollY
    scrollOf.set(path, y)
    if (el.current) el.current.style.marginTop = `${-y}px`
  }, [present, path])

  // Arriving by "back": put the scroll back where it was.
  useLayoutEffect(() => {
    if (dir === -1) window.scrollTo(0, scrollOf.get(path) ?? 0)
    else window.scrollTo(0, 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(parentOf(path), { replace: true })
  }
  const swipe = useRef<{ id: number; x0: number; y0: number; active: boolean; trail: { x: number; t: number }[] } | null>(null)
  const swallowClick = useRef(false)
  const canSwipe = present && depth > 0

  const onDown = (e: ReactPointerEvent) => {
    if (!canSwipe || e.clientX > SWIPE_ZONE || (e.pointerType === 'mouse' && e.button !== 0)) return
    swipe.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, trail: [{ x: e.clientX, t: e.timeStamp }] }
  }
  const onMove = (e: ReactPointerEvent) => {
    const g = swipe.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0
    if (!g.active) {
      if (Math.abs(dy) > SWIPE_START && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return } // that is a scroll, not a swipe
      if (dx < SWIPE_START || dx < Math.abs(dy)) return
      g.active = true
      g.x0 = e.clientX // the page starts moving from here, not with a jump
      x.stop()
      el.current?.setPointerCapture(e.pointerId)
    }
    x.set(Math.max(0, e.clientX - g.x0))
    g.trail.push({ x: e.clientX, t: e.timeStamp })
    while (g.trail.length > 2 && e.timeStamp - g.trail[0].t > 100) g.trail.shift() // speed over the last ~0.1s
  }
  const onUp = (e: ReactPointerEvent) => {
    const g = swipe.current
    swipe.current = null
    if (!g || !g.active || e.pointerId !== g.id) return
    swallowClick.current = true // the lift must not also press whatever is under the finger
    setTimeout(() => { swallowClick.current = false }, 60)
    const first = g.trail[0], last = g.trail[g.trail.length - 1]
    const speed = last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * 1000 : 0 // px per second
    const cancelled = e.type === 'pointercancel'
    if (!cancelled && (x.get() > window.innerWidth * SWIPE_FRACTION || speed > SWIPE_FLICK)) back()
    else animate(x, 0, SPRING)
  }

  return (
    <motion.div
      ref={setRef}
      className="ss-layer"
      custom={dir}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      style={{ x, zIndex: present ? (dir === -1 ? 1 : 2) : dir === -1 ? 3 : 1, touchAction: canSwipe ? 'pan-y' : undefined }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onClickCapture={(e) => { if (swallowClick.current) { e.preventDefault(); e.stopPropagation() } }}
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {!hidesNav(path) && <TeamBar />}
      {children}
    </motion.div>
  )
}

/** Renders the current screen with iOS-style motion: deeper screens slide in over the top, "back" slides them out, and tabs cross-fade. */
export function PageTransition() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const depth = depthOf(pathname)
  const prev = useRef({ depth, pathname })
  const dir = depth > prev.current.depth ? 1 : depth < prev.current.depth ? -1 : 0

  useLayoutEffect(() => { prev.current = { depth, pathname } }, [depth, pathname])

  return (
    <AnimatePresence mode="popLayout" custom={dir} initial={false}>
      <Layer key={pathname} path={pathname} depth={depth}>{outlet}</Layer>
    </AnimatePresence>
  )
}
