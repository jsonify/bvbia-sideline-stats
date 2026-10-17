import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RepoContext } from '../../data/context'
import type { Repository } from '../../data/repository'
import type { Team, TeamGoals } from '../../types'
import { TeamTargets } from './TeamTargets'

const team: Team = { id: 't', name: 'Lions', joinCode: 'ABC234', goals: { duel: 60 } }
const show = (saveGoals: (g: TeamGoals) => Promise<Team>, t = team) =>
  render(<RepoContext.Provider value={{ saveGoals } as unknown as Repository}><TeamTargets team={t} /></RepoContext.Provider>)
afterEach(cleanup)

describe('TeamTargets', () => {
  it('shows the saved targets and saves changes for the whole team', async () => {
    const save = vi.fn(async (goals: TeamGoals) => ({ ...team, goals }))
    show(save)
    const duel = screen.getByLabelText('Defensive 1v1s won') as HTMLInputElement
    expect(duel.value).toBe('60')
    const button = screen.getByRole('button', { name: 'Save targets' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(duel, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Box entries with a shot'), { target: { value: '45' } })
    fireEvent.click(button)
    expect(await screen.findByText('Saved for the whole team')).toBeTruthy()
    expect(save).toHaveBeenCalledWith({ box_entry: 45 })
  })

  it("won't save a target over 100%, and says why a save failed", async () => {
    const save = vi.fn(async () => { throw new Error('Targets need the 0007_team_goals.sql migration on the server') })
    show(save)
    fireEvent.change(screen.getByLabelText('Clean first contact'), { target: { value: '150' } })
    expect(screen.getByRole('alert').textContent).toMatch(/1 to 100/)
    expect((screen.getByRole('button', { name: 'Save targets' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Clean first contact'), { target: { value: '65' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save targets' }))
    expect(await screen.findByText(/0007_team_goals\.sql/)).toBeTruthy()
  })
})
