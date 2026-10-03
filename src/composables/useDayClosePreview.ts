import { ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseService } from '@/services/day-close.service'
import type { DayClosePreview } from '@/types/day-close'

/**
 * CARTA 9.1B — the live `GET .../day-close/preview` read model: computed on
 * every call, nothing persisted. Same reactive gate/abort/restaurant-switch
 * pattern as every other restaurant-scoped composable in this codebase
 * (useRestaurantOperations, useRestaurantActivity, ...) — switching
 * restaurants aborts whatever was in flight and clears the previous
 * restaurant's preview before loading the new one (§42, no bleed).
 *
 * `openingFloat` is only ever sent back to the backend when THIS preview
 * itself reported `cash.opening_float_source === 'required'` — see
 * `refetchWithOpeningFloat`, the one place a caller may ask for a second
 * preview call with a manually entered float, purely to show what
 * `expected_cash` WOULD be (§14). Nothing here invents a suggested value
 * the backend didn't already send.
 */
export function useDayClosePreview(restaurantId: () => number | null, enabled: () => boolean) {
  const preview = ref<DayClosePreview | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  let controller: AbortController | null = null
  let targetRestaurantId: number | null = null

  async function fetch(openingFloat?: string): Promise<void> {
    const id = restaurantId()
    controller?.abort()
    if (id === null || !enabled()) {
      preview.value = null
      error.value = null
      loading.value = false
      return
    }
    controller = new AbortController()
    const { signal } = controller
    targetRestaurantId = id
    loading.value = true
    error.value = null

    try {
      const result = await dayCloseService.preview(id, openingFloat, signal)
      if (signal.aborted || targetRestaurantId !== id) return
      preview.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  /** §14 — a manually typed opening float, previewed before it's ever submitted. Never used when the backend already suggests one. */
  async function refetchWithOpeningFloat(openingFloat: string): Promise<void> {
    await fetch(openingFloat)
  }

  function refetch(): void {
    void fetch()
  }

  watch(
    () => [restaurantId(), enabled()] as const,
    () => void fetch(),
    { immediate: true },
  )

  return { preview, loading, error, refetch, refetchWithOpeningFloat }
}
