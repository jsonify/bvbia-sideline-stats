import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RepoContext } from '../../data/context'
import { RequireTeam } from '../shell/Shell'
import GameFormPage from './GameFormPage'
import OnboardingPage from './OnboardingPage'
import { makeFakeRepo } from './fakeRepo'

const wrap = (repo: ReturnType<typeof makeFakeRepo>, path: string) =>
  render(
    <RepoContext.Provider value={repo}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/welcome" element={<div>welcome-page</div>} />
          <Route path="/" element={<RequireTeam><div>home-page</div></RequireTeam>} />
          <Route path="/games/new" element={<GameFormPage />} />
          <Route path="/games/:id/track" element={<div>tracker-page</div>} />
        </Routes>
      </MemoryRouter>
    </RepoContext.Provider>,
  )

describe('onboarding redirect', () => {
  it('redirects to /welcome without a team', async () => {
    wrap(makeFakeRepo(null), '/')
    expect(await screen.findByText('welcome-page')).toBeTruthy()
  })
  it('renders content when a team exists', async () => {
    wrap(makeFakeRepo({ id: 't', name: 'T', joinCode: 'X' }), '/')
    expect(await screen.findByText('home-page')).toBeTruthy()
  })
})

describe('game form validation', () => {
  it('offers no quarters option: soccer games are always two halves', async () => {
    wrap(makeFakeRepo({ id: "t1", name: "T", joinCode: "ABC123" }), "/games/new")
    await screen.findByLabelText(/opponent/i)
    expect(screen.queryByText(/quarter/i)).toBeNull()
    expect(screen.queryByText(/game format/i)).toBeNull()
  })

  it('blocks save without an opponent', async () => {
    const repo = makeFakeRepo({ id: 't', name: 'T', joinCode: 'X' })
    wrap(repo, '/games/new')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(repo.games).toHaveLength(0)
  })
  it('saves and starts tracking with a live status', async () => {
    const repo = makeFakeRepo({ id: 't', name: 'T', joinCode: 'X' })
    wrap(repo, '/games/new')
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: ' Rapids ' } })
    fireEvent.click(screen.getByRole('button', { name: /start tracking/i }))
    expect(await screen.findByText('tracker-page')).toBeTruthy()
    await waitFor(() => expect(repo.games[0]).toMatchObject({ opponent: 'Rapids', status: 'live', home: true, periods: 2 }))
  })
})

describe('joining from an invite', () => {
  const join = (repo: ReturnType<typeof makeFakeRepo>, path: string) =>
    render(
      <RepoContext.Provider value={repo}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/welcome" element={<OnboardingPage />} />
            <Route path="/" element={<div>home-page</div>} />
          </Routes>
        </MemoryRouter>
      </RepoContext.Provider>,
    )

  it('opening the shared link lands on the join step with the code already filled in', async () => {
    const repo = makeFakeRepo(null)
    const spy = vi.spyOn(repo, 'joinTeam')
    join(repo, '/welcome?code=abc234')
    expect(screen.queryByText('Create my team')).toBeNull()
    expect((screen.getByLabelText('Team code') as HTMLInputElement).value).toBe('ABC234')
    expect(screen.getByText(/filled in the code from your invite link/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }))
    expect(await screen.findByText('home-page')).toBeTruthy()
    expect(spy).toHaveBeenCalledWith('ABC234')
  })

  it('without a link it still starts with the two choices', () => {
    join(makeFakeRepo(null), '/welcome')
    expect(screen.getByText('Create my team')).toBeTruthy()
    expect(screen.getByText('Join with team code')).toBeTruthy()
  })

  it('the first screen carries the BVB crest; the join step does not', () => {
    const { container } = join(makeFakeRepo(null), '/welcome')
    expect(container.querySelector('.gm-welcome > img[src="/Borussia_Dortmund_logo.svg"]')).toBeTruthy()
    fireEvent.click(screen.getByText('Join with team code'))
    expect(container.querySelector('.gm-welcome img')).toBeNull()
  })

  it('manual path: tells you to paste the code from the invite, and cleans up what you paste', async () => {
    const repo = makeFakeRepo(null)
    const spy = vi.spyOn(repo, 'joinTeam')
    join(repo, '/welcome')
    fireEvent.click(screen.getByText('Join with team code'))
    expect(screen.getByText(/Paste the team code from the invite you were sent/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Team code'), { target: { value: ' abc 234 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }))
    await screen.findByText('home-page')
    expect(spy).toHaveBeenCalledWith('ABC234')
  })

  it('pasting the whole invite link into the box works too', async () => {
    const repo = makeFakeRepo(null)
    const spy = vi.spyOn(repo, 'joinTeam')
    join(repo, '/welcome')
    fireEvent.click(screen.getByText('Join with team code'))
    fireEvent.change(screen.getByLabelText('Team code'), { target: { value: 'https://sideline.example.com/welcome?code=abc234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }))
    await screen.findByText('home-page')
    expect(spy).toHaveBeenCalledWith('ABC234')
  })

  it('a wrong code from a link says so plainly and lets you fix it', async () => {
    const repo = makeFakeRepo(null)
    repo.joinTeam = async () => { throw new Error('No team found with that code') }
    join(repo, '/welcome?code=NOPE22')
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't find that code/i)
    fireEvent.change(screen.getByLabelText('Team code'), { target: { value: 'ABC234' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Back from the prefilled step goes to the two choices with an empty box', () => {
    join(makeFakeRepo(null), '/welcome?code=ABC234')
    fireEvent.click(screen.getByText('‹ Back'))
    expect(screen.getByText('Create my team')).toBeTruthy()
    fireEvent.click(screen.getByText('Join with team code'))
    expect((screen.getByLabelText('Team code') as HTMLInputElement).value).toBe('')
    expect(screen.getByText(/Paste the team code from the invite/)).toBeTruthy()
  })

  it('after creating a team, shows the invite card with the share steps', async () => {
    join(makeFakeRepo(null), '/welcome')
    fireEvent.click(screen.getByText('Create my team'))
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'U10 Thunder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }))
    await screen.findByText(/all set/i)
    expect(screen.getByRole('button', { name: 'Share code' })).toBeTruthy()
    expect(screen.getByText('How other parents join')).toBeTruthy()
    expect(screen.getByLabelText('Invite link').textContent).toContain('/welcome?code=ABC123')
  })
})
