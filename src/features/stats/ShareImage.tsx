import { useEffect, useState } from 'react'
import { Sheet } from '../../ui'
import { cardBlob, drawShareCard, type CardInput } from './shareCard'
import { slug } from './insights'

type Card = { url: string; file: File } | 'failed' | null

/**
 * "Share image": draws the game summary as a picture, shows it, then hands it to the phone's share sheet (or saves it
 * where sharing files isn't supported). The picture is drawn when the sheet opens, so the Share tap itself is instant,
 * which is what the browser's share sheet needs to open.
 */
export function ShareImage({ input, onStatus }: { input: CardInput; onStatus: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState<Card>(null)
  const name = `${slug(input.game.opponent)}-${input.game.date}-summary.png`

  useEffect(() => {
    if (!open) return
    let alive = true, url = ''
    setCard(null)
    void (async () => {
      const canvas = await drawShareCard(input)
      const blob = canvas && await cardBlob(canvas)
      if (!alive) return
      if (!blob) { setCard('failed'); return }
      url = URL.createObjectURL(blob)
      setCard({ url, file: new File([blob], name, { type: 'image/png' }) })
    })()
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
    // Drawn once per opening: a tap arriving while the sheet is open shouldn't swap the picture being shared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ready = card && card !== 'failed' ? card : null
  const canShareFile = !!ready && typeof navigator.canShare === 'function' && navigator.canShare({ files: [ready.file] })

  const share = async (close: () => void) => {
    if (!ready) return
    try {
      await navigator.share({ files: [ready.file], title: `vs ${input.game.opponent}` })
      close()
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') onStatus('Could not share the image. Try Save image instead.')
    }
  }
  const save = (close: () => void) => {
    if (!ready) return
    const a = document.createElement('a')
    a.href = ready.url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    onStatus('Image saved.')
    close()
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Share image</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Share the summary" className="share-sheet">
        {(close) => (
          <div className="stats share-body">
            <div className="share-preview">
              {card === null && <p className="sub" role="status">Drawing…</p>}
              {card === 'failed' && <p className="sub" role="alert">This browser can't draw the image. Use Share summary to send it as text.</p>}
              {ready && <img src={ready.url} alt={`Summary card for the game vs ${input.game.opponent}`} />}
            </div>
            <div className="actions">
              {canShareFile && <button className="btn primary" onClick={() => void share(close)}>Share</button>}
              <button className={`btn${canShareFile ? '' : ' primary'}`} disabled={!ready} onClick={() => save(close)}>Save image</button>
              <button className="btn" onClick={close}>Close</button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
