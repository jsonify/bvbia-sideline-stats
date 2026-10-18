import { describe, expect, it } from 'vitest'
import { cleanScore, resultOf, scoreText } from './score'

describe('score', () => {
  it('keeps only whole goals from 0 to 99 on both sides', () => {
    expect(cleanScore({ us: 3, them: 0 })).toEqual({ us: 3, them: 0 })
    for (const bad of [null, undefined, {}, { us: 1 }, { us: -1, them: 0 }, { us: 1.5, them: 0 }, { us: 100, them: 0 }, { us: '2', them: 1 }])
      expect(cleanScore(bad)).toBeNull()
  })
  it('reads the result from our side', () => {
    expect(resultOf({ score: { us: 2, them: 1 } })).toBe('W')
    expect(resultOf({ score: { us: 1, them: 1 } })).toBe('D')
    expect(resultOf({ score: { us: 0, them: 4 } })).toBe('L')
    expect(resultOf({ score: null })).toBeNull()
    expect(resultOf({})).toBeNull()
  })
  it('writes ours first', () => {
    expect(scoreText({ score: { us: 0, them: 2 } })).toBe('0–2')
    expect(scoreText({})).toBe('')
  })
})
