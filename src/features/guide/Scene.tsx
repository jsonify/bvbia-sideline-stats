import type { ReactNode } from 'react'
import type { SceneId } from './topics'

// Small top-down pictures for the stat guide. Our goal is on the left (like the game map), except box entries,
// where we attack the goal on the right. Yellow = our team, dark = the other team. Colours come from the theme
// (see guide.css) so the pictures work in light and dark mode and with any team accent.

type Pt = readonly [number, number]
type Tone = 'plain' | 'good' | 'bad'

const W = 320, H = 160

/** A pass, kick or dribble (solid), or a player running (dotted). The arrowhead is drawn by hand, not with an SVG marker. */
function Arrow({ from, to, via, run, tone = 'plain' }: { from: Pt; to: Pt; via?: Pt; run?: boolean; tone?: Tone }) {
  const [fx, fy] = from, [tx, ty] = to
  const [cx, cy] = via ?? [(fx + tx) / 2, (fy + ty) / 2]
  const a = Math.atan2(ty - cy, tx - cx)
  const L = 10, half = 5.5
  const bx = tx - Math.cos(a) * L, by = ty - Math.sin(a) * L // where the line stops and the head starts
  const px = -Math.sin(a) * half, py = Math.cos(a) * half
  return (
    <g className={`gd-arrow ${tone}${run ? ' run' : ''}`}>
      <path className="line" d={via ? `M${fx} ${fy}Q${cx} ${cy} ${bx} ${by}` : `M${fx} ${fy}L${bx} ${by}`} />
      <path className="head" d={`M${tx} ${ty}L${bx + px} ${by + py}L${bx - px} ${by - py}Z`} />
    </g>
  )
}

const Us = ({ at }: { at: Pt }) => <circle className="gd-us" cx={at[0]} cy={at[1]} r={9} />
const Them = ({ at }: { at: Pt }) => <circle className="gd-them" cx={at[0]} cy={at[1]} r={9} />
const Ball = ({ at }: { at: Pt }) => <circle className="gd-ball" cx={at[0]} cy={at[1]} r={5} />

/** The good or bad result of the picture, in the same colours as the buttons on the tracker. */
function Badge({ tone, at = [296, 24] }: { tone: 'good' | 'bad'; at?: Pt }) {
  return (
    <g className={`gd-badge ${tone}`} transform={`translate(${at[0]} ${at[1]})`}>
      <circle r={12} />
      <path d={tone === 'good' ? 'M-5.5 0.5L-1.5 4.5L6 -4' : 'M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5'} />
    </g>
  )
}

/** A red cross on the spot where our player was too late. */
const Missed = ({ at }: { at: Pt }) => (
  <path className="gd-missed" transform={`translate(${at[0]} ${at[1]})`} d="M-5 -5L5 5M5 -5L-5 5" />
)

const Label = ({ at, children }: { at: Pt; children: ReactNode }) => (
  <text className="gd-label" x={at[0]} y={at[1]} textAnchor="middle">{children}</text>
)

/** One end of the pitch with a goal on `side`: goal line, penalty box, six-yard box and spot. `lit` tints the box. */
function Pitch({ side, lit }: { side: 'left' | 'right'; lit?: boolean }) {
  // Drawn as the left end with the goal line at x=0, then moved in so the whole goal shows, and mirrored for the right.
  const inset = 12
  return (
    <>
      <rect className="gd-grass" width={W} height={H} />
      <g className="gd-lines" transform={side === 'right' ? `translate(${W - inset} 0) scale(-1 1)` : `translate(${inset} 0)`}>
        <rect className={lit ? 'lit' : undefined} x={0} y={24} width={92} height={112} />
        <rect x={0} y={54} width={30} height={52} />
        <circle className="spot" cx={64} cy={80} r={2} />
        <rect className="goal" x={-9} y={62} width={9} height={36} rx={2} />
      </g>
    </>
  )
}

interface SceneDef { label: string; draw: () => ReactNode }

const OUR_GOAL_LEFT = 'Picture, with our goal on the left. '

const SCENES: Record<SceneId, SceneDef> = {
  'duel-won': {
    label: `${OUR_GOAL_LEFT}An attacker from the other team dribbles at our defender. Our defender knocks the ball away and the attacker is stopped.`,
    draw: () => (
      <>
        <Pitch side="left" />
        <Arrow from={[204, 84]} to={[150, 84]} run />
        <Arrow from={[124, 76]} to={[204, 34]} via={[150, 30]} tone="good" />
        <Us at={[112, 84]} />
        <Them at={[216, 84]} />
        <Ball at={[214, 32]} />
        <Badge tone="good" />
      </>
    ),
  },
  'duel-lost': {
    label: `${OUR_GOAL_LEFT}An attacker from the other team dribbles around our defender and keeps going toward our goal.`,
    draw: () => (
      <>
        <Pitch side="left" />
        <Arrow from={[204, 90]} to={[62, 114]} via={[148, 130]} run tone="bad" />
        <Us at={[112, 84]} />
        <Them at={[216, 84]} />
        <Ball at={[196, 84]} />
        <Badge tone="bad" />
      </>
    ),
  },
  'through-clean': {
    label: `${OUR_GOAL_LEFT}The other team rolls a pass along the ground between two of our defenders. One of our defenders gets to the ball first.`,
    draw: () => (
      <>
        <Pitch side="left" />
        <Arrow from={[258, 70]} to={[156, 90]} />
        <Arrow from={[106, 128]} to={[122, 108]} run />
        <Us at={[104, 40]} />
        <Us at={[130, 98]} />
        <Them at={[270, 66]} />
        <Ball at={[148, 92]} />
        <Badge tone="good" />
      </>
    ),
  },
  'through-miss': {
    label: `${OUR_GOAL_LEFT}The other team rolls a pass along the ground between two of our defenders. The ball rolls past, our defender is a step late, and an attacker runs onto it.`,
    draw: () => (
      <>
        <Pitch side="left" />
        <Arrow from={[258, 70]} to={[80, 90]} />
        <Arrow from={[104, 130]} to={[116, 104]} run />
        <Us at={[104, 40]} />
        <Us at={[104, 120]} />
        <Them at={[270, 66]} />
        <Them at={[52, 106]} />
        <Ball at={[68, 92]} />
        <Missed at={[118, 85]} />
        <Badge tone="bad" />
      </>
    ),
  },
  'long-clean': {
    label: `${OUR_GOAL_LEFT}The other team kicks the ball high and a long way toward our goal. Our defender reaches it before the attacker does.`,
    draw: () => (
      <>
        <Pitch side="left" />
        <Arrow from={[270, 112]} to={[140, 80]} via={[200, -6]} />
        <Arrow from={[184, 112]} to={[154, 94]} run />
        <Us at={[118, 84]} />
        <Them at={[284, 118]} />
        <Them at={[190, 116]} />
        <Ball at={[132, 80]} />
        <Label at={[206, 24]}>high in the air</Label>
        <Badge tone="good" />
      </>
    ),
  },
  'long-miss': {
    label: `${OUR_GOAL_LEFT}The other team kicks the ball high and a long way toward our goal. It sails over our defender's head and lands near an attacker.`,
    draw: () => (
      <>
        <Pitch side="left" />
        <Arrow from={[270, 112]} to={[78, 80]} via={[190, -14]} />
        <Us at={[136, 90]} />
        <Them at={[284, 118]} />
        <Them at={[52, 104]} />
        <Ball at={[64, 84]} />
        <Missed at={[136, 70]} />
        <Label at={[206, 20]}>high in the air</Label>
        <Badge tone="bad" />
      </>
    ),
  },
  'box-shot': {
    label: 'Picture, with the other team\'s goal on the right and the box around it. We pass the ball into the box, then take a shot at goal.',
    draw: () => (
      <>
        <Pitch side="right" lit />
        <Arrow from={[184, 98]} to={[240, 88]} />
        <Arrow from={[268, 82]} to={[307, 68]} tone="good" />
        <Us at={[170, 100]} />
        <Us at={[252, 86]} />
        <Them at={[222, 122]} />
        <Them at={[292, 98]} />
        <Ball at={[264, 84]} />
        <Label at={[260, 40]}>THE BOX</Label>
        <Badge tone="good" at={[24, 24]} />
      </>
    ),
  },
  'box-noshot': {
    label: 'Picture, with the other team\'s goal on the right and the box around it. We pass the ball into the box, but a defender from the other team clears it away, so we get no shot.',
    draw: () => (
      <>
        <Pitch side="right" lit />
        <Arrow from={[184, 98]} to={[240, 88]} />
        <Arrow from={[236, 62]} to={[150, 36]} via={[196, 36]} tone="bad" />
        <Us at={[170, 100]} />
        <Us at={[254, 90]} />
        <Them at={[244, 62]} />
        <Them at={[290, 84]} />
        <Ball at={[140, 34]} />
        <Label at={[274, 40]}>THE BOX</Label>
        <Badge tone="bad" at={[24, 24]} />
      </>
    ),
  },
}

export const SCENE_IDS = Object.keys(SCENES) as SceneId[]

export function Scene({ id }: { id: SceneId }) {
  const s = SCENES[id]
  return (
    <svg className="gd-scene" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.label}>
      {s.draw()}
    </svg>
  )
}
