import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { TeamBar } from './TeamBar'
import {
  AnimatePresence, animate, motion, useIsPresent, useMotionValue, usePresenceData,
  type MotionValue, type Variants,
} from 'motion/react'

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

/** What the edge-swipe strip needs to move the page that is on top, and to leave it. */
interface Swipeable { x: MotionValue<number>; back: () => void }
const SwipeContext = createContext<RefObject<Swipeable | null> | null>(null)

const scrollOf = new Map<string, number>() // scroll position each screen was left at, so "back" lands where you were

interface LayerProps { path: string; depth: number; children: ReactNode }

function Layer({ path, depth, children }: LayerProps) {
  const present = useIsPresent()
  const dir = (usePresenceData() as number | undefined) ?? 0
  const el = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const swipe = useContext(SwipeContext)
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
  const backRef = useRef(back)
  backRef.current = back

  useLayoutEffect(() => {
    if (!present || !swipe) return
    const handle: Swipeable = { x, back: () => backRef.current() }
    swipe.current = handle
    return () => { if (swipe.current === handle) swipe.current = null }
  }, [present, swipe, x])

  return (
    <motion.div
      ref={el}
      className="ss-layer"
      custom={dir}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      style={{ x, zIndex: present ? (dir === -1 ? 1 : 2) : dir === -1 ? 3 : 1 }}
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
  const swipe = useRef<Swipeable | null>(null)
  const start = useRef<{ id: number; x0: number; last: number; lastT: number; v: number } | null>(null)

  // Dragging from the left edge: the page follows the finger, and lets go either way depending on how far and how fast.
  const onDown = (e: React.PointerEvent) => {
    if (!swipe.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipe.current.x.stop()
    start.current = { id: e.pointerId, x0: e.clientX, last: e.clientX, lastT: e.timeStamp, v: 0 }
  }
  const onMove = (e: React.PointerEvent) => {
    const s = start.current, page = swipe.current
    if (!s || !page || e.pointerId !== s.id) return
    page.x.set(Math.max(0, e.clientX - s.x0))
    const dt = e.timeStamp - s.lastT
    if (dt > 0) s.v = ((e.clientX - s.last) / dt) * 1000 // px per second
    s.last = e.clientX; s.lastT = e.timeStamp
  }
  const onUp = (e: React.PointerEvent) => {
    const s = start.current, page = swipe.current
    start.current = null
    if (!s || !page || e.pointerId !== s.id) return
    if (page.x.get() > window.innerWidth / 3 || s.v > 600) page.back()
    else animate(page.x, 0, SPRING)
  }

  useLayoutEffect(() => { prev.current = { depth, pathname } }, [depth, pathname])

  return (
    <SwipeContext.Provider value={swipe}>
      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        <Layer key={pathname} path={pathname} depth={depth}>{outlet}</Layer>
      </AnimatePresence>
      {depth > 0 && (
        <div className="ss-edge" aria-hidden="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      )}
    </SwipeContext.Provider>
  )
}
