// SHARED CONTRACT — do not change without coordinating. All features build on these types.

export type Uuid = string

export interface Team {
  id: Uuid
  name: string
  joinCode: string // short code parents use to join the team's data
}

export interface Game {
  id: Uuid
  teamId: Uuid
  opponent: string
  date: string // ISO date YYYY-MM-DD
  location?: string
  home: boolean
  periods: 2 | 4 // halves or quarters
  status: 'scheduled' | 'live' | 'final'
  notes?: string
  createdAt: string // ISO timestamp
  updatedAt: string
}

/** The three stat categories the coach asked for. */
export type StatCategory = 'duel' | 'first_contact' | 'box_entry'

export type BallType = 'through_ball' | 'long_ball'

/**
 * One tap = one StatEvent. Events are append-only (undo = soft delete via deletedAt),
 * which makes offline sync and multi-keeper merging conflict-free.
 *
 *  duel          outcome: 'won' | 'lost'        (defensive 1v1s)
 *  first_contact outcome: 'clean' | 'miss'      + ballType (cleared/controlled vs missed/poor touch)
 *  box_entry     outcome: 'shot' | 'no_shot'    (got into/around the box: did we get a shot off?)
 */
export type StatEvent =
  | BaseEvent<'duel', 'won' | 'lost'>
  | BaseEvent<'first_contact', 'clean' | 'miss'> & { ballType: BallType }
  | BaseEvent<'box_entry', 'shot' | 'no_shot'>

interface BaseEvent<C extends StatCategory, O extends string> {
  id: Uuid
  gameId: Uuid
  category: C
  outcome: O
  period: number // 1-based
  createdAt: string // ISO timestamp (client time)
  deletedAt?: string | null // set when undone
  keeperId?: string // device/user that recorded it
}

export type NewStatEvent = DistributiveOmit<StatEvent, 'id' | 'createdAt' | 'deletedAt' | 'keeperId'>
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never

/** Derived numbers used everywhere (tracker screen, dashboard, exports). */
export interface StatSummary {
  duels: { won: number; lost: number; total: number; winPct: number | null }
  firstContact: {
    clean: number; miss: number; total: number; cleanPct: number | null
    throughBall: { clean: number; miss: number }
    longBall: { clean: number; miss: number }
  }
  boxEntries: { shot: number; noShot: number; total: number; shotPct: number | null }
}
