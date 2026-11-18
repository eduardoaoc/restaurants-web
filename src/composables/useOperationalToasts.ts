import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { OperationsAlert } from '@/types/operations'
import { createToastQueue, selectNewAlertIds, type OperationalToast } from '@/utils/operational-toast-queue'

/** A phone shows fewer notifications at once so they never cover the screen. */
const PHONE_QUERY = '(max-width: 640px)'
export const MAX_VISIBLE_DESKTOP = 3
export const MAX_VISIBLE_PHONE = 2

interface Options {
  restaurantId: () => number | null
  /** The live snapshot's alerts; `null` while there is no snapshot (loading, error, restaurant switch). */
  alerts: () => readonly OperationsAlert[] | null
  /** Leftovers from earlier days are in the attention queue, not announced as news. */
  isCurrent: (alert: OperationsAlert) => boolean
  toToast: (alert: OperationsAlert) => OperationalToast | null
}

/**
 * New operational alerts → live notifications. The source is the snapshot's own `alerts` (refetched on every realtime
 * event), so what is announced is exactly what the attention queue lists, with the same ids, table and age: nothing is
 * invented from raw event payloads. See utils/operational-toast-queue.ts for the queue rules.
 */
export function useOperationalToasts(options: Options) {
  const visible = shallowRef<readonly OperationalToast[]>([])
  const waiting = shallowRef(0)
  const phone = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null
  const queue = createToastQueue({
    maxVisible: () => (phone?.matches ? MAX_VISIBLE_PHONE : MAX_VISIBLE_DESKTOP),
    onChange: state => { visible.value = state.visible; waiting.value = state.waiting },
  })
  let seen: ReadonlySet<string> | null = null
  const onPhoneChange = (): void => queue.refill()
  phone?.addEventListener('change', onPhoneChange)

  // A different restaurant starts clean: nothing carried over, and its first snapshot only seeds what is already pending.
  watch(options.restaurantId, () => { queue.reset(); seen = null })

  watch(options.alerts, alerts => {
    if (!alerts) return
    const current = alerts.filter(options.isCurrent)
    const ids = current.map(alert => alert.id)
    const fresh = new Set(selectNewAlertIds(seen, ids))
    seen = new Set(ids)
    queue.retainOnly(seen)
    for (const alert of current) {
      if (!fresh.has(alert.id)) continue
      const toast = options.toToast(alert)
      if (toast) queue.offer(toast)
    }
  }, { immediate: true })

  onBeforeUnmount(() => { phone?.removeEventListener('change', onPhoneChange); queue.reset() })

  return {
    visible, waiting,
    dismiss: (id: string) => queue.dismiss(id),
    pause: (reason: string) => queue.pause(reason),
    resume: (reason: string) => queue.resume(reason),
  }
}
