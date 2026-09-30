import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { RepoContext } from '../../data/context'
import { RequireTeam } from '../shell/Shell'
import GameFormPage from './GameFormPage'
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
