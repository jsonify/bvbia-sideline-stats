import { describe, expect, it, vi } from 'vitest'

// A stand-in for the Supabase client: records each upsert and answers with whatever `answers` holds next.
const upserts: Record<string, unknown>[] = []
const answers: ({ code?: string; message: string } | null)[] = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: () => ({
      upsert: async (row: Record<string, unknown>) => { upserts.push(JSON.parse(JSON.stringify(row))); return { error: answers.shift() ?? null } },
    }),
  }),
}))

const { createSupabaseRemote, toEventRow, toGameRow } = await import('./remote')

const tap = { id: 'e1', gameId: 'g1', teamId: 't1', category: 'box_entry', outcome: 'shot', period: 1, createdAt: '2026-01-01T00:00:00Z', zone: 'near_c' } as const

describe('zones on the server', () => {
  it('sends a zone only when the tap has one', () => {
    expect(toEventRow(tap as any)).toMatchObject({ zone: 'near_c' })
    const { zone: _z, ...plain } = tap
    expect('zone' in toEventRow(plain as any)).toBe(false)
  })

  it('sends the tap again without its zone when the server has no zone column yet', async () => {
    upserts.length = 0
    answers.push({ code: 'PGRST204', message: "Could not find the 'zone' column of 'stat_events' in the schema cache" })
    const remote = createSupabaseRemote('http://x', 'k')
    await remote.push({ table: 'stat_events', row: tap as any })
    expect(upserts).toHaveLength(2)
    expect(upserts[0].zone).toBe('near_c')
    expect('zone' in upserts[1]).toBe(false)
    expect(upserts[1]).toMatchObject({ id: 'e1', outcome: 'shot' })
  })
})

const game = { id: 'g1', teamId: 't1', opponent: 'Bears', date: '2026-01-01', home: true, periods: 2, status: 'final', createdAt: 'x', updatedAt: 'x' } as const

describe('scores on the server', () => {
  it('sends a score once one was entered, and nulls when it was cleared', () => {
    expect('score_us' in toGameRow(game as any)).toBe(false)
    expect(toGameRow({ ...game, score: { us: 3, them: 1 } } as any)).toMatchObject({ score_us: 3, score_them: 1 })
    expect(toGameRow({ ...game, score: null } as any)).toMatchObject({ score_us: null, score_them: null })
  })

  it('sends the game again without its score when the server has no score columns yet', async () => {
    upserts.length = 0
    answers.push({ code: 'PGRST204', message: "Could not find the 'score_them' column of 'games' in the schema cache" })
    const remote = createSupabaseRemote('http://x', 'k')
    await remote.push({ table: 'games', row: { ...game, score: { us: 2, them: 2 } } as any })
    expect(upserts).toHaveLength(2)
    expect(upserts[0].score_us).toBe(2)
    expect('score_us' in upserts[1]).toBe(false)
    expect(upserts[1]).toMatchObject({ id: 'g1', status: 'final' })
  })
})
