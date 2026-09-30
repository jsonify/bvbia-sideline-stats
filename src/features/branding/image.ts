const MAX_SIDE = 256
const MAX_INPUT_BYTES = 12 * 1024 * 1024
const MAX_OUTPUT_CHARS = 150_000

/** Resize an uploaded logo to <=256px and return a small PNG/WebP data URL (keeps transparency). */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPG, SVG or WebP).')
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is too large. Please pick one under 12 MB.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error("We couldn't read that image. Try a PNG or JPG."))
      i.src = url
    })
    const w0 = img.naturalWidth || MAX_SIDE, h0 = img.naturalHeight || MAX_SIDE
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0)) || 1
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Image processing is not supported in this browser.')
    ctx.drawImage(img, 0, 0, w, h)
    let out = canvas.toDataURL('image/png')
    if (out.length > MAX_OUTPUT_CHARS) out = canvas.toDataURL('image/webp', 0.85)
    if (out.length > MAX_OUTPUT_CHARS || !/^data:image\/(png|webp);base64,/.test(out)) throw new Error('That image is too detailed. Try a simpler logo.')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}
