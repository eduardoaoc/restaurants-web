import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { analyticsService } from '@/services/analytics.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { AnalyticsQuery, RestaurantAnalytics } from '@/types/analytics'

/**
 * Analytics for the current restaurant — deliberately lazy (CLAUDE.md §51):
 * nothing is fetched until `load()` is called (the Análise tab actually
 * being opened), so switching restaurants while on the Operação tab never
 * triggers an unnecessary GET /analytics. Once the tab has been opened at
 * least once, a restaurant switch re-fetches with the same query.
 */
export function useRestaurantAnalytics() {
  const restaurantStore = useRestaurantStore()

  const data = ref<RestaurantAnalytics | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const hasLoadedOnce = ref(false)
  const currentQuery = ref<AnalyticsQuery>({})

  let controller: AbortController | null = null

  async function fetch(query: AnalyticsQuery): Promise<void> {
    const restaurantId = restaurantStore.currentRestaurantId
    controller?.abort()
    error.value = null

    if (restaurantId === null) {
      data.value = null
      return
    }

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await analyticsService.get(restaurantId, query, signal)
      if (signal.aborted) return
      data.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
      data.value = null
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function load(query: AnalyticsQuery = currentQuery.value): Promise<void> {
    hasLoadedOnce.value = true
    currentQuery.value = query
    return fetch(query)
  }

  watch(
    () => restaurantStore.currentRestaurantId,
    () => {
      if (hasLoadedOnce.value) void fetch(currentQuery.value)
    },
  )

  onBeforeUnmount(() => controller?.abort())

  return { data, loading, error, hasLoadedOnce, currentQuery, load }
}
