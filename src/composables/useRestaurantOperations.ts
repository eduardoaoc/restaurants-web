import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { operationsService } from '@/services/operations.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { OperationsLiveSnapshot } from '@/types/operations'

/**
 * Operations Live snapshot for the current restaurant (CLAUDE.md §14-16):
 * resolves the restaurant, fetches GET /operations/live, and re-fetches
 * cleanly on every restaurant switch — the in-flight request for the
 * previous restaurant is aborted so a slow response can never overwrite the
 * new restaurant's state (never show stale data mid-switch).
 */
export function useRestaurantOperations() {
  const restaurantStore = useRestaurantStore()

  const snapshot = ref<OperationsLiveSnapshot | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  let controller: AbortController | null = null

  async function fetch(restaurantId: number | null): Promise<void> {
    controller?.abort()
    snapshot.value = null
    error.value = null

    if (restaurantId === null) return

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await operationsService.live(restaurantId, signal)
      if (signal.aborted) return
      snapshot.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function refetch(): void {
    void fetch(restaurantStore.currentRestaurantId)
  }

  watch(() => restaurantStore.currentRestaurantId, fetch, { immediate: true })

  onBeforeUnmount(() => controller?.abort())

  return { snapshot, loading, error, refetch }
}
