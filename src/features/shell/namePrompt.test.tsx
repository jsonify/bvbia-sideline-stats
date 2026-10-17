import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { RepoContext } from '../../data/context'
import type { Repository } from '../../data/repository'
import { NamePrompt } from './NamePrompt'

const repoWith = (initial = '') => {
  let name = initial
  return { repo: { getDisplayName: async () => name, setDisplayName: async (n: string) => { name = n } } as unknown as Repository, get: () => name }
}
function Go() {
  const nav = useNavigate()
  return <button onClick={() => nav('/games/g1/track')}>go-track</button>
}
const show = (r: Repository, path = '/') => render(
  <RepoContext.Provider value={r}>
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<><Go /><NamePrompt /></>} /></Routes>
    </MemoryRouter>
  </RepoContext.Provider>,
)
afterEach(cleanup)

describe('NamePrompt', () => {
  it('asks for a name when there is none and saves it', async () => {
    const f = repoWith()
    show(f.repo)
    const input = await screen.findByLabelText('Your name')
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/enter your name/i)
    fireEvent.change(input, { target: { value: '  Sam ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(f.get()).toBe('Sam'))
    await waitFor(() => expect(screen.queryByLabelText('Your name')).toBeNull())
  })

  it('stays quiet when a name is already saved', async () => {
    show(repoWith('Sam').repo)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByLabelText('Your name')).toBeNull()
  })

  it('"Not now" puts it off until a tracker is opened', async () => {
    show(repoWith().repo)
    await screen.findByLabelText('Your name')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByLabelText('Your name')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'go-track' }))
    expect(await screen.findByLabelText('Your name')).toBeTruthy()
  })
})
