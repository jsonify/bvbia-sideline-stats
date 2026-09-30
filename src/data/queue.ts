// Offline write queue: ordered, persistent, retried with exponential backoff.
import type { SyncState } from './repository'

export interface QueueOp {
  table: 'games' | 'stat_events'
  /** Full row snapshot in app (camelCase) shape; the remote adapter maps it. */
  row: Record<string, unknown>
}

export interface QueueStore {
  all(): Promise<{ key: number; op: QueueOp }[]>
  add(op: QueueOp): Promise<void>
  remove(key: number): Promise<void>
}

export class PermanentError extends Error {
  permanent = true
}

export interface QueueOptions {
  store: QueueStore
  send: (op: QueueOp) => Promise<void>
  isOnline?: () => boolean
  baseDelayMs?: number
  maxDelayMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}

export class WriteQueue {
  private listeners = new Set<(s: SyncState, pending: number) => void>()
  private state: SyncState = 'synced'
  private pending = 0
  private running = false
  private again = false
  private failures = 0
  private timer: unknown = null
  private o: Required<Omit<QueueOptions, 'store' | 'send'>> & QueueOptions

  constructor(opts: QueueOptions) {
    this.o = {
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      baseDelayMs: 1000,
      maxDelayMs: 60_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      ...opts,
    }
  }

  onState(cb: (s: SyncState, pending: number) => void): () => void {
    this.listeners.add(cb)
    cb(this.state, this.pending)
    return () => this.listeners.delete(cb)
  }

  private emit(state: SyncState, pending = this.pending) {
    this.state = state
    this.pending = pending
    this.listeners.forEach((l) => l(state, pending))
  }

  async enqueue(op: QueueOp): Promise<void> {
    await this.o.store.add(op)
    this.emit(this.state, this.pending + 1)
    void this.flush()
  }

  /** Load persisted count (call on startup) and try to flush. */
  async init(): Promise<void> {
    const items = await this.o.store.all()
    this.emit(items.length ? (this.o.isOnline() ? 'syncing' : 'offline') : 'synced', items.length)
    if (items.length) void this.flush()
  }

  /** Called when the browser goes online etc. Resets backoff. */
  kick(): void {
    this.failures = 0
    if (this.timer) { this.o.clearTimer(this.timer); this.timer = null }
    void this.flush()
  }

  async flush(): Promise<void> {
    if (this.running) { this.again = true; return }
    this.running = true
    try {
      do {
        this.again = false
        await this.pass()
      } while (this.again)
    } finally {
      this.running = false
    }
  }

  private async pass(): Promise<void> {
    const items = await this.o.store.all()
    if (items.length === 0) { this.failures = 0; this.emit('synced', 0); return }
    if (!this.o.isOnline()) { this.emit('offline', items.length); return }
    this.emit('syncing', items.length)
    let left = items.length
    let hadPermanent = false
    for (const { key, op } of items) {
      try {
        await this.o.send(op)
        await this.o.store.remove(key)
        left--
        this.emit('syncing', left)
      } catch (err) {
        if ((err as { permanent?: boolean }).permanent) {
          await this.o.store.remove(key) // will never succeed; drop so it can't block the queue
          left--
          hadPermanent = true
          continue
        }
        this.failures++
        this.emit(this.o.isOnline() ? 'error' : 'offline', left)
        this.schedule()
        return
      }
    }
    this.failures = 0
    this.emit(hadPermanent ? 'error' : 'synced', left)
  }

  private schedule() {
    if (this.timer) return
    const delay = Math.min(this.o.maxDelayMs, this.o.baseDelayMs * 2 ** (this.failures - 1))
    this.timer = this.o.setTimer(() => { this.timer = null; void this.flush() }, delay)
  }

  dispose() {
    if (this.timer) this.o.clearTimer(this.timer)
    this.timer = null
  }
}
