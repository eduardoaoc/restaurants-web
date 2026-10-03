import { onBeforeUnmount, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseWhatsAppService } from '@/services/day-close-whatsapp.service'
import { useRestaurantStore } from '@/stores/restaurant'

export function useDayCloseWhatsAppResend(dayCloseId: () => number | null, enabled: () => boolean) {
  const restaurant = useRestaurantStore()
  const open = ref(false)
  const submitting = ref(false)
  const error = ref<ApiError | null>(null)
  const pending = new Set<string>()
  // Retained across cancel/reopen after an uncertain outcome, scoped to restaurant + close.
  const uncertainKeys = new Map<string, string>()
  let attemptKey: string | null = null
  let generation = 0
  let disposed = false
  const scope = () => `${restaurant.currentRestaurantId}:${dayCloseId()}`

  function begin(): void {
    if (!enabled() || dayCloseId() === null || pending.has(scope())) return
    attemptKey = uncertainKeys.get(scope()) ?? crypto.randomUUID()
    error.value = null
    open.value = true
  }
  function cancel(): void {
    if (submitting.value) return
    open.value = false
    error.value = null
    attemptKey = null
  }
  async function confirm(): Promise<boolean> {
    const id = dayCloseId()
    const target = scope()
    const token = generation
    if (id === null || !enabled() || !open.value || !attemptKey || pending.has(target) || disposed) return false
    const key = attemptKey
    pending.add(target)
    uncertainKeys.set(target, key)
    submitting.value = true
    error.value = null
    const current = () => !disposed && token === generation && target === scope() && enabled()
    try {
      await dayCloseWhatsAppService.resend(id, key)
      uncertainKeys.delete(target)
      if (!current()) return false
      open.value = false
      attemptKey = null
      return true
    } catch (err) {
      const normalized = normalizeApiError(err)
      const uncertain = normalized.kind === 'network' || normalized.kind === 'server' || normalized.kind === 'unknown'
      if (!uncertain) uncertainKeys.delete(target)
      if (current()) {
        error.value = normalized
        if (!uncertain) attemptKey = crypto.randomUUID()
      }
      return false
    } finally {
      pending.delete(target)
      if (!disposed && target === scope()) submitting.value = false
    }
  }
  watch(() => [dayCloseId(), restaurant.currentRestaurantId, enabled()], () => {
    ++generation
    open.value = false
    error.value = null
    attemptKey = null
    submitting.value = pending.has(scope())
  }, { flush: 'sync' })
  onBeforeUnmount(() => { disposed = true; ++generation })
  return { open, submitting, error, begin, cancel, confirm }
}
