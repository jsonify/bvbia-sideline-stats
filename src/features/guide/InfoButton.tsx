import { useRef, useState } from 'react'
import { Icon } from '../../ui'
import { GuideSheet } from './GuideSheet'
import { TOPICS, type TopicId } from './topics'
import './guide.css'

/**
 * A small "i" that opens the stat guide on `topic`. It looks after its own sheet, so a page only has to drop it
 * next to a stat's name. It stays tappable when the page's own buttons are off (e.g. while watching a game).
 */
export function InfoButton({ topic, tracking }: { topic: TopicId; tracking?: boolean }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  // Back to this button on close, even where a tap never focused it (Safari), so nobody loses their place.
  const close = () => { setOpen(false); trigger.current?.focus() }
  return (
    <>
      <button ref={trigger} type="button" className="gd-info" aria-label={`About ${TOPICS[topic].tab}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="gd-info-i"><Icon name="info" size={22} /></span>
      </button>
      {open && <GuideSheet topic={topic} tracking={tracking} onClose={close} />}
    </>
  )
}
