import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RepoContext } from '../../data/context'
import type { Repository } from '../../data/repository'
import { YourName } from './YourName'

const repoWith = (initial = '') => {
  let name = initial
  return { repo: { getDisplayName: async () => name, setDisplayName: async (n: string) => { name = n } } as unknown as Repository, get: () => name }
}
const show = (r: Repository) => render(<RepoContext.Provider value={r}><YourName /></RepoContext.Provider>)
afterEach(cleanup)

describe('YourName', () => {
  it('saves a trimmed name and confirms', async () => {
    const f = repoWith()
    show(f.repo)
    const input = (await screen.findByLabelText('Your name')) as HTMLInputElement
    expect((screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '  Sam ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await screen.findByText('Saved')
    expect(f.get()).toBe('Sam')
    expect(input.value).toBe('Sam')
  })

  it('shows the saved name and can clear it', async () => {
    const f = repoWith('Sam')
    show(f.repo)
    const input = (await screen.findByLabelText('Your name')) as HTMLInputElement
    expect(input.value).toBe('Sam')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(f.get()).toBe(''))
    await screen.findByText('Name removed')
  })
})
