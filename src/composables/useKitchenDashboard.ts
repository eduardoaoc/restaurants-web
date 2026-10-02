import { onBeforeUnmount, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { kitchenService } from '@/services/kitchen.service'
import type { KitchenDashboard } from '@/types/kitchen'

/**
 * Mirrors useKitchenOrders' own gate/abort pattern exactly (Carta 7.1B):
 * same `restaurantId`/`enabled` reactive gate, same abort-on-superseded
 * fetch. A separate composable rather than folding this into
 * useKitchenOrders — the dashboard is its own read model (GET
 * /kitchen/dashboard), not derived from the order queue, and a consumer
 * that only needs the queue (e.g. a future kiosk view) shouldn't pay for a
 * dashboard fetch it never reads.
 */
export function useKitchenDashboard(restaurantId: () => number | null, enabled: () => boolean) {
  const dashboard = ref<KitchenDashboard | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  let controller: AbortController | null = null

  async function refetch(): Promise<void> {
    controller?.abort()
    const id = restaurantId()
    if (id === null || !enabled()) return
    const request = new AbortController()
    controller = request
    loading.value = true
    error.value = null
    try {
      const result = await kitchenService.dashboard(id, request.signal)
      if (request.signal.aborted) return
      dashboard.value = result
    } catch (err) {
      if (request.signal.aborted) return
      error.value = normalizeApiError(err)
      if (['forbidden', 'unauthenticated', 'not_found'].includes(error.value.kind)) dashboard.value = null
    } finally {
      if (!request.signal.aborted) loading.value = false
    }
  }

  watch(() => [restaurantId(), enabled()] as const, () => {
    controller?.abort()
    dashboard.value = null
    error.value = null
    loading.value = false
    void refetch()
  }, { immediate: true, flush: 'sync' })

  onBeforeUnmount(() => controller?.abort())
  return { dashboard, loading, error, refetch }
}
