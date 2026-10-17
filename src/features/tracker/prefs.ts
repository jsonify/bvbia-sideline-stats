import { useCallback, useState } from 'react'

// Small per-phone choices for the tracker screen (how this parent likes to tap). They live in localStorage, so they are
// only ever a convenience: if storage is blocked or cleared the screen just starts from the default.

const read = <T extends string>(key: string, allowed: readonly T[], initial: T): T => {
  try {
    const v = localStorage.getItem(key)
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : initial
  } catch { return initial }
}

/** A remembered choice from `allowed`, starting at `initial` when nothing (valid) was saved. */
export function usePref<T extends string>(key: string, allowed: readonly T[], initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, allowed, initial))
  const set = useCallback((v: T) => {
    setValue(v)
    try { localStorage.setItem(key, v) } catch { /* storage blocked: keep it for this visit only */ }
  }, [key])
  return [value, set]
}

export type TapStyle = 'field' | 'buttons'
export const TAP_STYLES: readonly TapStyle[] = ['field', 'buttons']
export const TAP_STYLE_KEY = 'sideline.tapStyle'
/** Per game: '1' when this parent turned the field round because we attack the other way. */
export const swapKey = (gameId: string) => `sideline.swapEnds.${gameId}`
