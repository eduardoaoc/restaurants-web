import { onBeforeUnmount, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseWhatsAppService } from '@/services/day-close-whatsapp.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { DayCloseDelivery } from '@/types/day-close-whatsapp'
import { isDeliveryInFlight, WHATSAPP_POLL_INTERVAL } from '@/utils/day-close-whatsapp'

/** Detail only. One timeout scheduled after a completed request; never overlapping polls. */
export function useDayCloseDeliveries(dayCloseId: () => number | null, enabled: () => boolean) {
  const restaurant = useRestaurantStore()
  const deliveries = ref<DayCloseDelivery[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<ApiError | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let sequence = 0
  let disposed = false

  function stopTimer(): void { if (timer !== null) clearTimeout(timer); timer = null }
  function schedule(): void {
    stopTimer()
    const accessError = error.value && ['unauthenticated', 'forbidden', 'not_found'].includes(error.value.kind)
    if (!disposed && !accessError && enabled() && document.visibilityState !== 'hidden' && deliveries.value.some(d => isDeliveryInFlight(d.status))) {
      timer = setTimeout(() => void refresh(), WHATSAPP_POLL_INTERVAL)
    }
  }
  async function refresh(): Promise<void> {
    stopTimer()
    controller?.abort()
    const token = ++sequence
    const id = dayCloseId()
    const restaurantId = restaurant.currentRestaurantId
    if (id === null || restaurantId === null || !enabled() || disposed) return
    controller = new AbortController()
    const { signal } = controller
    const current = () => !disposed && !signal.aborted && sequence === token && dayCloseId() === id && restaurant.currentRestaurantId === restaurantId && enabled()
    loading.value = true
    error.value = null
    try {
      const result = await dayCloseWhatsAppService.getDeliveries(id, signal)
      if (current()) { deliveries.value = result; loaded.value = true }
    } catch (err) {
      if (current()) error.value = normalizeApiError(err)
    } finally {
      if (current()) { loading.value = false; schedule() }
    }
  }
  function reset(): void {
    ++sequence
    stopTimer()
    controller?.abort()
    deliveries.value = []
    loading.value = false
    loaded.value = false
    error.value = null
  }
  function visibilityChanged(): void {
    if (document.visibilityState === 'hidden') stopTimer()
    else if (enabled()) void refresh()
  }
  watch(() => [dayCloseId(), restaurant.currentRestaurantId, enabled()], () => { reset(); void refresh() }, { immediate: true, flush: 'sync' })
  document.addEventListener('visibilitychange', visibilityChanged)
  onBeforeUnmount(() => { disposed = true; reset(); document.removeEventListener('visibilitychange', visibilityChanged) })
  return { deliveries, loading, loaded, error, refresh }
}
