import { describe, expect, it } from 'vitest'
import { inviteLink, inviteMessage, parseJoinCode } from './invite'

describe('inviteLink', () => {
  it('opens the join screen with the code filled in', () => {
    expect(inviteLink('abc234', 'https://sideline.example.com')).toBe('https://sideline.example.com/welcome?code=ABC234')
  })
  it('does not double the slash when the origin ends with one', () => {
    expect(inviteLink('ABC234', 'https://sideline.example.com/')).toBe('https://sideline.example.com/welcome?code=ABC234')
  })
  it('defaults to the address the app is running at', () => {
    expect(inviteLink('ABC234')).toBe(`${window.location.origin}/welcome?code=ABC234`)
  })
})

describe('inviteMessage', () => {
  const link = 'https://sideline.example.com/welcome?code=ABC234'
  const text = inviteMessage('U10 Thunder', 'abc234', link)

  it('has the team, the app link and the code', () => {
    expect(text).toContain('U10 Thunder')
    expect(text).toContain(link)
    expect(text).toContain('ABC234')
  })
  it('walks through the steps in order: open the link, paste the code, tap join', () => {
    const at = (s: string) => text.indexOf(s)
    expect(at('1) Tap this link')).toBeGreaterThan(-1)
    expect(at('1) Tap this link')).toBeLessThan(at(link))
    expect(at(link)).toBeLessThan(at('2) Tap "Join with team code"'))
    expect(at('2) Tap "Join with team code"')).toBeLessThan(at('\nABC234\n'))
    expect(at('\nABC234\n')).toBeLessThan(at('3) Tap "Join team"'))
  })
  it('puts the link and the code on their own lines so chat apps make the link tappable and the code easy to select', () => {
    const lines = text.split('\n')
    expect(lines).toContain(link)
    expect(lines).toContain('ABC234')
  })
  it('explains that parents can split a game between defense and offense, or one can track everything, and the rest can watch', () => {
    expect(text).toMatch(/one on defense and one on offense/)
    expect(text).toMatch(/one parent can track everything/)
    expect(text).toMatch(/watch live/)
  })
})

describe('parseJoinCode', () => {
  it.each([
    ['ABC234', 'ABC234'],
    ['  abc234  ', 'ABC234'],
    ['abc 234', 'ABC234'],
    ['ABC-234', 'ABC234'],
    ['https://sideline.example.com/welcome?code=abc234', 'ABC234'],
    ['https://sideline.example.com/welcome?add=1&code=ABC234', 'ABC234'],
    ['', ''],
  ])('%j -> %j', (input, want) => expect(parseJoinCode(input)).toBe(want))

  it('finds the code when the whole invite message was pasted', () => {
    const msg = inviteMessage('U10 Thunder', 'ABC234', 'https://sideline.example.com/welcome?code=ABC234')
    expect(parseJoinCode(msg)).toBe('ABC234')
  })
})
