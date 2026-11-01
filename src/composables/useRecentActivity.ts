import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { restaurantActivityService } from '@/services/restaurant-activity.service'
import type { RestaurantActivityEvent } from '@/types/activity'

/**
 * A read-only "latest N events" slice of the real activity feed for the
 * Operation board. Deliberately NOT useRestaurantActivity: that one owns the
 * bell's unread cursor and its own Reverb channel — reading the first page
 * here never marks anything as read and opens no second subscription.
 * Freshness piggybacks on the operations snapshot: `refreshKey` is its
 * `generated_at`, which already changes on every realtime-driven refetch.
 */
export function useRecentActivity(
  restaurantId: () => number | null,
  enabled: () => boolean,
  refreshKey: () => string | null,
  perPage = 6,
) {
  const events = ref<RestaurantActivityEvent[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  let controller: AbortController | null = null

  async function load(): Promise<void> {
    const id = restaurantId()
    controller?.abort()
    if (id === null || !enabled()) {
      events.value = []
      error.value = null
      return
    }
    controller = new AbortController()
    const { signal } = controller
    loading.value = true
    try {
      const { activity } = await restaurantActivityService.list(id, { per_page: perPage }, signal)
      if (signal.aborted) return
      events.value = activity
      error.value = null
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  // A restaurant switch must never show the previous restaurant's feed.
  watch(restaurantId, () => { events.value = [] })
  watch(() => [restaurantId(), enabled(), refreshKey()] as const, () => { void load() }, { immediate: true })
  onBeforeUnmount(() => controller?.abort())

  return { events, loading, error, retry: load }
}
