import type { GameLanes } from '../../data/repository'
import { LANES, ROLES, ROLE_BLURB, ROLE_LABEL, type Lane, type Role } from '../../lib/lanes'
import { agoText } from './labels'

interface Props {
  role: Role | null
  held: Lane[]
  lanes: GameLanes | null
  /** True when this phone is tracking everything and nobody else is around: the moment to mention splitting up. */
  hint: boolean
  onPick: (role: Role) => void
}

/** What this phone tracks (everything, or just defense or offense) and who has the rest. */
export function RolePanel({ role, held, lanes, hint, onPick }: Props) {
  const solo = held.length === LANES.length && LANES.every((l) => lanes?.[l].holder !== 'other')
  return (
    <section className="tk-roles" aria-label="What you track">
      <h2>What you track</h2>
      <div className="tk-seg" role="radiogroup" aria-label="What you track">
        {ROLES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => onPick(r)}>
            {ROLE_LABEL[r]}<small>{ROLE_BLURB[r]}</small>
          </button>
        ))}
      </div>
      {!solo && (
        <ul className="tk-lanes" aria-label="Who is tracking what">
          {LANES.map((l) => {
            const t = lanes?.[l]
            return (
              <li key={l}>
                <span>{ROLE_LABEL[l]}</span>
                {held.includes(l) ? <b>You</b>
                  : t?.holder === 'other' ? <b>{t.name || 'Another parent'}<small> · active {agoText(t.idleSeconds)}</small></b>
                  : <b className="open">Nobody yet</b>}
              </li>
            )
          })}
        </ul>
      )}
      {solo && hint && <p className="tk-roles-hint">Tracking on your own is fine. If another parent can help, pick Defense or Offense here, then ask them to open this game and take the other.</p>}
    </section>
  )
}
