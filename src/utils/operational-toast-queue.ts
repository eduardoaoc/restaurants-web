/**
 * Queue behind the Dashboard's live notifications. Framework-free so its rules can be tested with fake timers:
 *
 *  - at most `maxVisible()` toasts at once (fewer on a phone); the rest wait, most urgent first, never overlapping;
 *  - a toast leaves on its own after `duration` ms, but the clock stops while the person hovers or focuses the stack
 *    (any number of independent pause reasons) and resumes with the time that was left;
 *  - the same alert is never shown twice: an id stays "known" while its situation lasts, even after the toast was closed
 *    or timed out. Closing a toast only closes the toast — the situation itself stays in the attention queue until it is
 *    resolved. Once it is resolved (`retainOnly`) the id is forgotten, so a NEW occurrence is announced again;
 *  - a critical toast never waits behind routine ones: when the stack is full it replaces the oldest non-critical toast
 *    (that situation is still listed in the attention queue).
 */
export type ToastTone = 'critical' | 'warning' | 'info'

export interface OperationalToast {
  /** Deduplication key: the alert id, stable for the same underlying fact. */
  id: string
  tone: ToastTone
  title: string
  table?: string
  /** Pre-formatted wall-clock time of the situation, in the restaurant's timezone. */
  time?: string
  detail?: string
  /** Short contextual action; `run` receives nothing and must be idempotent. */
  action?: { label: string; run: () => void }
}

export interface ToastTimers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  now: () => number
}

export const TOAST_DURATION_MS = 4000
const TONE_RANK: Record<ToastTone, number> = { critical: 0, warning: 1, info: 2 }

interface Entry { toast: OperationalToast; remaining: number; startedAt: number; handle: unknown }

export interface ToastQueueOptions {
  maxVisible: () => number
  duration?: number
  timers?: ToastTimers
  onChange?: (state: { visible: readonly OperationalToast[]; waiting: number }) => void
}

export function createToastQueue(options: ToastQueueOptions) {
  const duration = options.duration ?? TOAST_DURATION_MS
  const timers: ToastTimers = options.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  }
  let visible: Entry[] = []
  let waiting: OperationalToast[] = []
  const known = new Set<string>()
  const pauses = new Set<string>()

  const emit = () => options.onChange?.({ visible: visible.map(entry => entry.toast), waiting: waiting.length })

  function start(entry: Entry): void {
    if (pauses.size || entry.handle !== null) return
    entry.startedAt = timers.now()
    entry.handle = timers.setTimeout(() => { entry.handle = null; remove(entry.toast.id) }, entry.remaining)
  }
  function stop(entry: Entry): void {
    if (entry.handle === null) return
    timers.clearTimeout(entry.handle)
    entry.handle = null
    entry.remaining = Math.max(0, entry.remaining - (timers.now() - entry.startedAt))
  }
  /** Takes a toast off the screen (or the waiting line) without forgetting it: it must not come back for the same fact. */
  function remove(id: string): void {
    const shown = visible.find(entry => entry.toast.id === id)
    if (shown) { stop(shown); visible = visible.filter(entry => entry !== shown) }
    waiting = waiting.filter(toast => toast.id !== id)
    fill()
    emit()
  }
  function fill(): void {
    const limit = Math.max(1, options.maxVisible())
    while (visible.length < limit && waiting.length) {
      const toast = waiting.shift()!
      const entry: Entry = { toast, remaining: duration, startedAt: 0, handle: null }
      visible = [...visible, entry]
      start(entry)
    }
  }
  function enqueue(toast: OperationalToast): void {
    const at = waiting.findIndex(other => TONE_RANK[other.tone] > TONE_RANK[toast.tone])
    if (at === -1) waiting.push(toast); else waiting.splice(at, 0, toast)
  }

  return {
    /** Returns false when this alert was already announced (or is already waiting). */
    offer(toast: OperationalToast): boolean {
      if (known.has(toast.id)) return false
      known.add(toast.id)
      enqueue(toast)
      const limit = Math.max(1, options.maxVisible())
      if (toast.tone === 'critical' && visible.length >= limit) {
        const victim = visible.find(entry => entry.toast.tone !== 'critical')
        if (victim) { stop(victim); visible = visible.filter(entry => entry !== victim) }
      }
      fill()
      emit()
      return true
    },
    /** The person closed it: gone for now, remembered so the same alert does not pop up again. */
    dismiss: remove,
    /** Keeps only the situations that still exist; anything resolved is dropped and forgotten (its toast too). */
    retainOnly(activeIds: ReadonlySet<string>): void {
      let changed = false
      for (const id of [...known]) {
        if (activeIds.has(id)) continue
        known.delete(id)
        const shown = visible.find(entry => entry.toast.id === id)
        if (shown) { stop(shown); visible = visible.filter(entry => entry !== shown) }
        waiting = waiting.filter(toast => toast.id !== id)
        changed = true
      }
      if (changed) { fill(); emit() }
    },
    pause(reason: string): void {
      if (pauses.has(reason)) return
      for (const entry of visible) stop(entry)
      pauses.add(reason)
    },
    resume(reason: string): void {
      if (!pauses.delete(reason) || pauses.size) return
      for (const entry of visible) start(entry)
    },
    /** The limit changed (rotation, resize): show what now fits. */
    refill(): void { fill(); emit() },
    reset(): void {
      for (const entry of visible) stop(entry)
      visible = []; waiting = []; known.clear(); pauses.clear()
      emit()
    },
    get visible(): readonly OperationalToast[] { return visible.map(entry => entry.toast) },
    get waiting(): number { return waiting.length },
  }
}

/**
 * Which alerts are new since the previous snapshot of the SAME restaurant. The first snapshot only seeds the set: what was
 * already pending when the screen opened is in the attention queue, not announced as if it had just happened.
 */
export function selectNewAlertIds(previous: ReadonlySet<string> | null, currentIds: readonly string[]): string[] {
  if (previous === null) return []
  return currentIds.filter(id => !previous.has(id))
}
