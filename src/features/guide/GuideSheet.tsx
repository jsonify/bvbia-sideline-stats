import { useRef, useState } from 'react'
import { Button, Icon, Sheet } from '../../ui'
import { Scene } from './Scene'
import { TOPICS, TOPIC_IDS, type TopicId } from './topics'
import './guide.css'

/** How to read the pictures: the same few shapes in every one. */
function Key() {
  return (
    <ul className="gd-key" aria-hidden="true">
      <li><svg width="18" height="18" viewBox="-9 -9 18 18"><circle className="gd-us" r="7" /></svg>Our team</li>
      <li><svg width="18" height="18" viewBox="-9 -9 18 18"><circle className="gd-them" r="7" /></svg>Other team</li>
      <li><svg width="18" height="18" viewBox="-9 -9 18 18"><circle className="gd-ball" r="5" /></svg>Ball</li>
      <li>
        <svg width="30" height="14" viewBox="0 0 30 14"><g className="gd-arrow plain"><path className="line" d="M2 7H19" /><path className="head" d="M28 7L19 2L19 12Z" /></g></svg>Pass or kick
      </li>
      <li>
        <svg width="30" height="14" viewBox="0 0 30 14"><g className="gd-arrow plain run"><path className="line" d="M2 7H19" /><path className="head" d="M28 7L19 2L19 12Z" /></g></svg>Player running
      </li>
    </ul>
  )
}

interface Props {
  /** Which stat to open on; the tabs switch to the others. */
  topic: TopicId
  /** True on the live tracker, where mistakes can be undone; false when someone is just reading the numbers. */
  tracking?: boolean
  onClose: () => void
}

/** What each stat means in plain words, with a picture for every button. Opens over the page, so a live game is left alone. */
export function GuideSheet({ topic, tracking, onClose }: Props) {
  const [id, setId] = useState(topic)
  const body = useRef<HTMLDivElement>(null)
  const t = TOPICS[id]
  const pick = (next: TopicId) => { setId(next); if (body.current) body.current.scrollTop = 0 } // each stat starts at its top

  return (
    <Sheet open onClose={onClose} label="What each stat means" className="gd-sheet">
      <div className="gd-bar">
        <div className="segmented gd-tabs" role="tablist" aria-label="Stat">
          {TOPIC_IDS.map((k) => (
            <button key={k} type="button" role="tab" id={`gd-tab-${k}`} aria-selected={k === id} aria-controls="gd-panel"
              className={k === id ? 'is-active' : undefined} onClick={() => pick(k)}>
              {TOPICS[k].tab}
            </button>
          ))}
        </div>
        <button type="button" className="gd-x" aria-label="Close" onClick={onClose}><Icon name="x" size={22} /></button>
      </div>

      <div ref={body} className="gd-body" role="tabpanel" id="gd-panel" aria-labelledby={`gd-tab-${id}`}>
        <h2 className="gd-title">{t.title}</h2>
        <p className="gd-lead">{t.lead}</p>
        <p className="gd-why"><b>Why we count it.</b> {t.why}</p>

        <Key />
        {t.sections.map((s) => (
          <section key={s.heading ?? 'main'} className="gd-sec">
            {s.heading && <h3>{s.heading}</h3>}
            {s.about && <p className="gd-about">{s.about}</p>}
            {s.outcomes.map((o) => (
              <figure key={o.scene} className={`gd-fig ${o.tone}`}>
                <Scene id={o.scene} />
                <figcaption>
                  <span className={`gd-pill ${o.tone}`}><i aria-hidden="true">{o.icon}</i>{o.label}</span>
                  <p>{o.when}</p>
                </figcaption>
              </figure>
            ))}
          </section>
        ))}

        <p className="gd-tip"><b>Good to know.</b> {t.tip}</p>

        <h3 className="gd-words-h">Words to know</h3>
        <dl className="gd-words">
          {t.words.map((w) => <div key={w.term}><dt>{w.term}</dt><dd>{w.meaning}</dd></div>)}
        </dl>

        <p className="gd-note">
          {tracking
            ? 'Tapped the wrong one? No problem. Every tap can be undone with the big Undo button at the bottom of the screen.'
            : 'These numbers come from taps parents made on the sideline. Each one is a quick judgment call, so use them to spot trends, not as an exact record.'}
        </p>
        <Button variant="primary" size="lg" block onClick={onClose}>Got it</Button>
      </div>
    </Sheet>
  )
}
