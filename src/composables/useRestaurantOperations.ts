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
 *
 * `refetch()` (called after a table/session mutation succeeds) is
 * deliberately NOT the same code path as a restaurant switch: it must never
 * null out `snapshot` first. Doing so used to blank the whole Operation view
 * (and silently close the open Table Drawer, since it renders off the same
 * snapshot) for the split second between every successful action and its
 * background refresh — a real bug found auditing the open/close/assign/
 * transfer/call flows end to end. `refreshing` lets the UI show a quiet
 * indicator instead, keeping the last-known-good snapshot on screen.
 *
 * `enabled` (Passo 1.2C, CLAUDE.md §16): when it returns false — the
 * current restaurant's auth context doesn't grant `view_operations` — this
 * never calls GET /operations/live at all. The UI is expected to already
 * be showing a permission-aware message in that case (see DashboardView);
 * this composable just makes sure no request goes out for it to react to.
 */
export function useRestaurantOperations(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()

  const snapshot = ref<OperationsLiveSnapshot | null>(null)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<ApiError | null>(null)

  let controller: AbortController | null = null

  async function fetch(restaurantId: number | null, isSwitch: boolean): Promise<void> {
    controller?.abort()

    if (isSwitch) {
      snapshot.value = null
      error.value = null
    }

    if (restaurantId === null) {
      snapshot.value = null
      return
    }

    controller = new AbortController()
    const { signal } = controller
    if (isSwitch) loading.value = true
    else refreshing.value = true

    try {
      const result = await operationsService.live(restaurantId, signal)
      if (signal.aborted) return
      snapshot.value = result
      error.value = null
    } catch (err) {
      if (signal.aborted) return
      // A background refresh failing keeps the last-known-good snapshot on
      // screen rather than replacing working content with an error banner —
      // only a real switch/first-load failure is surfaced that way.
      if (isSwitch) error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  function refetch(): void {
    if (!enabled()) return
    void fetch(restaurantStore.currentRestaurantId, false)
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([id, isEnabled]) => {
      if (!isEnabled) {
        controller?.abort()
        snapshot.value = null
        error.value = null
        loading.value = false
        refreshing.value = false
        return
      }
      void fetch(id, true)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => controller?.abort())

  return { snapshot, loading, refreshing, error, refetch }
}
