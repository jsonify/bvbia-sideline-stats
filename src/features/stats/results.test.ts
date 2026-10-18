import { describe, expect, it } from 'vitest'
import type { Game, GameScore, StatEvent } from '../../types'
import { summarize } from '../../lib/summary'
import { recordText, resultGroups, resultNotes, seasonRecord, targetRecords } from './results'

let n = 0
const game = (score?: GameScore | null): Game =>
  ({ id: `g${n++}`, teamId: 't', opponent: 'Bears', date: '2026-01-01', home: true, periods: 2, status: 'final', createdAt: '', updatedAt: '', score })
const evs = (category: string, good: number, bad: number) => [
  ...Array.from({ length: good }, () => ({ category, outcome: category === 'duel' ? 'won' : category === 'box_entry' ? 'shot' : 'clean', ballType: 'long_ball' })),
  ...Array.from({ length: bad }, () => ({ category, outcome: category === 'duel' ? 'lost' : category === 'box_entry' ? 'no_shot' : 'miss', ballType: 'long_ball' })),
] as unknown as StatEvent[]
const row = (score: GameScore | null, ...events: StatEvent[][]) => ({ game: game(score), s: summarize(events.flat()) })

describe('seasonRecord', () => {
  it('counts only games with a score', () => {
    const r = seasonRecord([game({ us: 3, them: 1 }), game({ us: 1, them: 1 }), game({ us: 0, them: 2 }), game({ us: 2, them: 0 }), game(), game(null)])
    expect(r).toEqual({ W: 2, D: 1, L: 1, games: 4, scored: 6, conceded: 4 })
    expect(recordText(r!)).toBe('2W 1D 1L')
    expect(seasonRecord([game()])).toBeNull()
  })
})

describe('resultGroups and resultNotes', () => {
  const rows = [
    row({ us: 3, them: 0 }, evs('duel', 7, 3), evs('box_entry', 6, 2)),
    row({ us: 2, them: 1 }, evs('duel', 6, 4), evs('box_entry', 4, 4)),
    row({ us: 0, them: 2 }, evs('duel', 4, 6), evs('box_entry', 1, 4)),
    row(null, evs('duel', 0, 10)), // no score: left out
  ]
  it('pools each stat and averages goals and entries per game, wins first, empty results left out', () => {
    const [w, l, ...rest] = resultGroups(rows)
    expect(rest).toHaveLength(0)
    expect(w).toMatchObject({ result: 'W', games: 2, scored: 2.5, conceded: 0.5, entries: 8, shots: 5, counts: { duel: { n: 13, d: 20 } } })
    expect(l).toMatchObject({ result: 'L', games: 1, scored: 0, conceded: 2, entries: 5, shots: 1, counts: { duel: { n: 4, d: 10 } } })
  })
  it('says what was different in wins, biggest gap first, then the attack', () => {
    const notes = resultNotes(resultGroups(rows))
    expect(notes[0]).toBe('Box entries with a shot: 63% in wins, 43 pts higher than in losses (20%).')
    expect(notes[1]).toBe('1v1s won: 65% in wins, 25 pts higher than in losses (40%).')
    expect(notes.at(-1)).toBe('Attack: 8 box entries and 5 shots a game in wins, 5 and 1 in losses.')
    expect(notes.some((x) => /first contact/.test(x))).toBe(false) // nothing tracked
  })
  it('leaves out a stat with too few events on one side', () => {
    const few = [row({ us: 1, them: 0 }, evs('duel', 5, 5)), row({ us: 0, them: 1 }, evs('duel', 1, 2))]
    expect(resultNotes(resultGroups(few)).filter((x) => /1v1s/.test(x))).toEqual([])
  })
  it('says nothing without both a win and a loss', () => {
    expect(resultNotes(resultGroups(rows.slice(0, 2)))).toEqual([])
  })
})

describe('targetRecords', () => {
  it('splits the record by whether each target was reached', () => {
    const rows = [
      row({ us: 2, them: 0 }, evs('duel', 7, 3)), // 70%: reached
      row({ us: 1, them: 1 }, evs('duel', 6, 4)), // 60%: reached
      row({ us: 0, them: 1 }, evs('duel', 3, 7)), // 30%: missed
      row({ us: 0, them: 3 }, evs('box_entry', 1, 1)), // no 1v1s: left out
    ]
    expect(targetRecords(rows, { duel: 60, first_contact: 50 })).toEqual([
      { cat: 'duel', goal: 60, hit: { W: 1, D: 1, L: 0 }, missed: { W: 0, D: 0, L: 1 } },
    ])
  })
})
