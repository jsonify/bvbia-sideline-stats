import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom'
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

// direction: 1 = push (go deeper), -1 = pop (go back), 0 = no motion: switching tabs, or the browser going back by itself.
// With 0 the new screen is simply there, as on an iOS tab bar. That also keeps us out of the way of the browser's own swipe-back
// animation, which freezes page animations part-way and used to leave the old screen stuck on top.
const NONE = { duration: 0 } as const
const variants: Variants = {
  enter: (d: number) => (d === 1 ? { x: '100%' } : d === -1 ? { x: UNDER } : { opacity: 1 }),
  center: (d: number) => ({ x: 0, opacity: 1, transition: d === 0 ? NONE : SPRING }),
  exit: (d: number) => (d === 1 ? { x: UNDER, transition: SPRING } : d === -1 ? { x: '100%', transition: SPRING } : { opacity: 1, transition: NONE }),
}

/** Set while this app is the one taking the user back (the edge swipe), so that is told apart from the browser doing it. */
const ours = { back: false }

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
    if (idx > 0) { ours.back = true; setTimeout(() => { ours.back = false }, 1500); navigate(-1) }
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

/** Renders the current screen with iOS-style motion: deeper screens slide in over the top and "back" slides them out. */
export function PageTransition() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const depth = depthOf(pathname)

  // Work out the direction once per screen change. POP is the history moving: ours (the swipe) animates, the browser's own doesn't.
  const seen = useRef({ path: pathname, depth, dir: 0 })
  if (seen.current.path !== pathname) {
    const byDepth = depth > seen.current.depth ? 1 : depth < seen.current.depth ? -1 : 0
    seen.current = { path: pathname, depth, dir: navType === 'POP' && !ours.back ? 0 : byDepth }
  }
  const dir = seen.current.dir
  useEffect(() => { ours.back = false }, [pathname])

  // Safety net: the old screen should be gone a moment after the new one arrives. If it is not (something froze the
  // animation), rebuild the screen rather than leave two stuck on top of each other.
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => { if (document.querySelectorAll('.ss-layer').length > 1) setEpoch((n) => n + 1) }, 1200)
    return () => window.clearTimeout(t)
  }, [pathname])

  return (
    <AnimatePresence key={epoch} mode="popLayout" custom={dir} initial={false}>
      <Layer key={pathname} path={pathname} depth={depth}>{outlet}</Layer>
    </AnimatePresence>
  )
}
