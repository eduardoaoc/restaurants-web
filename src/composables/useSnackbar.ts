import { computed, readonly, ref, shallowRef, type ComputedRef } from 'vue'

export type SnackbarKind = 'info' | 'success' | 'warning' | 'danger'
export interface SnackbarOptions {
  message: string
  action?: { label: string; onClick: () => void | Promise<void> }
  /** Milliseconds; zero keeps the message until explicitly dismissed. */
  duration?: number
  kind?: SnackbarKind
}
export interface SnackbarMessage extends SnackbarOptions { id: number; duration: number; kind: SnackbarKind }

/** SPA feedback queue, with an isolated factory for tests. No domain/store data. */
export function createSnackbarQueue() {
  const queue = shallowRef<SnackbarMessage[]>([])
  const current = computed(() => queue.value[0] ?? null)
  const pendingCount = computed(() => Math.max(0, queue.value.length - 1))
  const actionPending = ref(false)
  const host = shallowRef<symbol | null>(null)
  const hosts: symbol[] = []
  const pauses = new Set<string>()
  let sequence = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let started = 0
  let remaining = 0

  function stopTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      remaining = Math.max(0, remaining - (Date.now() - started))
    }
  }
  function startTimer(): void {
    if (timer !== undefined || !host.value || pauses.size || !current.value || current.value.duration === 0) return
    started = Date.now()
    const id = current.value.id
    timer = setTimeout(() => { timer = undefined; dismiss(id) }, remaining)
  }
  function resetCurrent(): void {
    stopTimer()
    pauses.clear()
    remaining = current.value?.duration ?? 0
    actionPending.value = false
    startTimer()
  }
  function showSnackbar(options: SnackbarOptions): number {
    if (!options.message.trim()) throw new TypeError('Snackbar message must not be empty')
    const duration = options.duration ?? (options.action ? 6000 : 4000)
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError('Snackbar duration must be nonnegative and finite')
    const message: SnackbarMessage = { ...options, id: ++sequence, duration, kind: options.kind ?? 'info' }
    queue.value = [...queue.value, message]
    if (queue.value.length === 1) resetCurrent()
    return message.id
  }
  function dismiss(id = current.value?.id): void {
    if (id === undefined) return
    const wasCurrent = current.value?.id === id
    if (wasCurrent) stopTimer()
    queue.value = queue.value.filter(message => message.id !== id)
    if (wasCurrent) resetCurrent()
  }
  function pause(reason = 'manual'): void { stopTimer(); pauses.add(reason) }
  function resume(reason = 'manual'): void { pauses.delete(reason); startTimer() }
  async function performAction(id = current.value?.id): Promise<void> {
    const message = current.value
    if (!message || message.id !== id || !message.action || actionPending.value) return
    actionPending.value = true
    pause('action')
    try { await message.action.onClick() }
    finally {
      // A late action must not dismiss or unpause a subsequent message.
      if (current.value?.id === id) dismiss(id)
    }
  }
  function attachHost(): { ownsHost: ComputedRef<boolean>; release: () => void } {
    const id = Symbol('snackbar-host')
    hosts.push(id)
    host.value = hosts[0]!
    startTimer()
    return {
      ownsHost: computed(() => host.value === id),
      release() {
        const index = hosts.indexOf(id)
        if (index < 0) return
        const wasOwner = host.value === id
        if (wasOwner) stopTimer()
        hosts.splice(index, 1)
        host.value = hosts[0] ?? null
        if (wasOwner) {
          pauses.delete('hover')
          pauses.delete('focus')
          startTimer()
        }
      },
    }
  }
  return { current: readonly(current), pendingCount, actionPending: readonly(actionPending), showSnackbar, dismiss, pause, resume, performAction, attachHost }
}

const snackbar = createSnackbarQueue()
export function useSnackbar() { return snackbar }
