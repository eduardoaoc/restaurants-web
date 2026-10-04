import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseService } from '@/services/day-close.service'
import type { DayCloseSummary, DayClosesQuery } from '@/types/day-close'

export interface DayCloseHistoryFilters {
  from: string | null
  to: string | null
  closedBy: number | null
  hasIncidents: boolean | null
}

function emptyFilters(): DayCloseHistoryFilters {
  return { from: null, to: null, closedBy: null, hasIncidents: null }
}

/**
 * CARTA 9.1B §34/§36 — owner/manager history, cursor-paginated per the real
 * `GET /restaurants/{restaurant}/day-closes` contract (newest business_date
 * first). Same fetchFirstPage/loadMore shape as useRestaurantActivity's own
 * cursor pagination — a filter change is always a fresh first page (cursors
 * are per-filtered-query on the backend).
 */
export function useDayCloseHistory(restaurantId: () => number | null, enabled: () => boolean) {
  const items = ref<DayCloseSummary[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<ApiError | null>(null)
  const nextCursor = ref<string | null>(null)
  const filters = ref<DayCloseHistoryFilters>(emptyFilters())

  let controller: AbortController | null = null
  let loadMoreController: AbortController | null = null
  let targetRestaurantId: number | null = null

  function queryParams(): DayClosesQuery {
    const f = filters.value
    return {
      ...(f.from ? { from: f.from } : {}),
      ...(f.to ? { to: f.to } : {}),
      ...(f.closedBy !== null ? { closed_by: f.closedBy } : {}),
      ...(f.hasIncidents !== null ? { has_incidents: f.hasIncidents } : {}),
    }
  }

  async function fetchFirstPage(): Promise<void> {
    const id = restaurantId()
    controller?.abort()
    if (id === null || !enabled()) {
      items.value = []
      nextCursor.value = null
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
      const result = await dayCloseService.list(id, queryParams(), signal)
      if (signal.aborted || targetRestaurantId !== id) return
      items.value = result.dayCloses
      nextCursor.value = result.nextCursor
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    const id = restaurantId()
    if (id === null || nextCursor.value === null || loadingMore.value) return
    loadMoreController?.abort()
    loadMoreController = new AbortController()
    const { signal } = loadMoreController
    loadingMore.value = true

    try {
      const result = await dayCloseService.list(id, { ...queryParams(), cursor: nextCursor.value }, signal)
      if (signal.aborted || targetRestaurantId !== id) return
      items.value = [...items.value, ...result.dayCloses]
      nextCursor.value = result.nextCursor
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loadingMore.value = false
    }
  }

  async function setFilters(next: DayCloseHistoryFilters): Promise<void> {
    filters.value = next
    await fetchFirstPage()
  }

  function retry(): void {
    void fetchFirstPage()
  }

  const hasMore = computed(() => nextCursor.value !== null)

  watch(
    () => [restaurantId(), enabled()] as const,
    () => {
      loadMoreController?.abort()
      items.value = []
      nextCursor.value = null
      loadingMore.value = false
      filters.value = emptyFilters()
      void fetchFirstPage()
    },
    { immediate: true, flush: 'sync' },
  )

  onBeforeUnmount(() => { controller?.abort(); loadMoreController?.abort() })

  return {
    items,
    loading,
    loadingMore,
    error,
    nextCursor,
    filters,
    hasMore,
    fetchFirstPage,
    loadMore,
    setFilters,
    retry,
  }
}
