// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { InfoButton } from './InfoButton'
import { SCENE_IDS, Scene } from './Scene'
import { TOPICS, TOPIC_IDS } from './topics'

afterEach(cleanup)

const gone = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()) // the sheet slides away before it leaves
const open = (name: string) => { fireEvent.click(screen.getByRole('button', { name })); return screen.getByRole('dialog', { name: 'What each stat means' }) }

describe('stat guide content', () => {
  it('gives every tracker button a picture, and every picture a spoken description', () => {
    const used = TOPIC_IDS.flatMap((t) => TOPICS[t].sections.flatMap((s) => s.outcomes.map((o) => o.scene)))
    expect(used.slice().sort()).toEqual(SCENE_IDS.slice().sort()) // none missing, none left unused
    for (const id of SCENE_IDS) {
      const { unmount } = render(<Scene id={id} />)
      expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Picture, with /)
      unmount()
    }
  })

  it('pairs each stat with the two buttons the tracker has for it', () => {
    const labels = (t: keyof typeof TOPICS) => TOPICS[t].sections.flatMap((s) => s.outcomes.map((o) => o.label))
    expect(labels('duel')).toEqual(['Won', 'Lost'])
    expect(labels('first_contact')).toEqual(['Clean', 'Miss', 'Clean', 'Miss']) // once for through balls, once for long balls
    expect(labels('box_entry')).toEqual(['Shot', 'No shot'])
  })
})

describe('InfoButton', () => {
  it('opens the guide on its own stat and closes with the button, Escape, or a tap outside', async () => {
    render(<InfoButton topic="first_contact" />)
    const trigger = screen.getByRole('button', { name: 'About First contact' })
    const dialog = open('About First contact')
    expect(within(dialog).getByRole('tab', { name: 'First contact' }).getAttribute('aria-selected')).toBe('true')
    expect(within(dialog).getByRole('heading', { name: 'Through ball' })).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'Long ball' })).toBeTruthy()
    expect(within(dialog).getAllByRole('img')).toHaveLength(4) // clean and miss, for each kind of ball

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await gone()
    expect(document.activeElement).toBe(trigger) // back where the parent was

    open('About First contact')
    fireEvent.keyDown(window, { key: 'Escape' })
    await gone()

    open('About First contact')
    fireEvent.click(screen.getByRole('dialog').parentElement!) // the dimmed area around the sheet
    await gone()

    open('About First contact')
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await gone()
  })

  it('lets you read about the other stats without closing it', () => {
    render(<InfoButton topic="duel" />)
    const dialog = open('About 1v1s')
    expect(within(dialog).getByText(/one attacker, one defender/i)).toBeTruthy()
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'Box entries' })) // Radix tabs switch on pointer-down
    expect(within(dialog).getByRole('heading', { name: 'Box entries' })).toBeTruthy()
    expect(within(dialog).getByText(/big rectangle painted on the grass/i)).toBeTruthy()
    expect(within(dialog).queryByText(/one attacker, one defender/i)).toBeNull()
    expect(within(dialog).getByRole('tab', { name: 'Box entries' }).getAttribute('aria-selected')).toBe('true')
    expect(within(dialog).getByRole('tab', { name: '1v1s' }).getAttribute('aria-selected')).toBe('false')
  })

  it('only talks about the Undo button on the live tracker', () => {
    const { unmount } = render(<InfoButton topic="duel" tracking />)
    expect(open('About 1v1s').textContent).toMatch(/Undo button/)
    unmount()
    render(<InfoButton topic="duel" />)
    expect(open('About 1v1s').textContent).not.toMatch(/Undo/)
  })

  it('leaves the page behind it scroll-locked only while open', () => {
    render(<InfoButton topic="box_entry" />)
    expect(document.body.style.overflow).toBe('')
    open('About Box entries')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })
})
