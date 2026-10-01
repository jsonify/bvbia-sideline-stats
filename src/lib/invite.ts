// What a parent sends to another parent to get them onto the team, and how the join screen reads it back.

/** Link that opens the app on the join screen with the team code already filled in. */
export function inviteLink(code: string, origin: string = window.location.origin): string {
  return `${origin.replace(/\/+$/, '')}/welcome?code=${encodeURIComponent(code.trim().toUpperCase())}`
}

/**
 * The text that gets shared: the app link, the code, and plain steps for someone who has never opened the app.
 * The link and the code are both in there on purpose. The link pre-fills the code, but a link opened from a chat
 * app can land in a different browser than the installed home-screen app, so the code has to be pasteable too.
 */
export function inviteMessage(teamName: string, code: string, link: string = inviteLink(code)): string {
  const c = code.trim().toUpperCase()
  return [
    `Join ${teamName} on Sideline Stats and help track our games!`,
    '',
    '1) Tap this link to open the app:',
    link,
    '',
    '2) Tap "Join with team code" and paste this code:',
    c,
    '(If the link filled the code in for you, skip to step 3.)',
    '',
    '3) Tap "Join team". That\'s it!',
    '',
    'Two parents can track a game at once: one on defense and one on offense (or one parent can track everything). Open the game, pick what you want to track, and watch live the rest of the time.',
  ].join('\n')
}

/** The same steps for showing on screen next to the code. */
export const INVITE_STEPS = [
  'They tap the link to open the app.',
  'They tap “Join with team code” and paste the code (the link fills it in for them).',
  'They tap “Join team”. Done!',
] as const

/**
 * Turn whatever got pasted into a join code: a bare code (any case, stray spaces or dashes),
 * or a whole invite link. Anything else is returned cleaned up and simply won't match a team.
 */
export function parseJoinCode(input: string): string {
  const s = input.trim()
  const fromLink = s.match(/[?&]code=([A-Za-z0-9]+)/)
  return (fromLink ? fromLink[1] : s).replace(/[\s-]+/g, '').toUpperCase()
}
