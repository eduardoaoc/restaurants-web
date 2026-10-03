import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseService } from '@/services/day-close.service'
import type { DayClose } from '@/types/day-close'
import { useRestaurantStore } from '@/stores/restaurant'

/**
 * CARTA 9.1B §37 — a single persisted Cierre Diario, by its real numeric
 * `id` (verified against the OpenAPI `{dayClose}` path parameter schema —
 * `type: integer`, never `public_id`). Never recomputed: the whole point of
 * `GET /day-closes/{id}` is to render its own immutable `report` exactly as
 * stored, regardless of how the restaurant's live data has changed since.
 */
export function useDayCloseDetail(dayCloseId: () => number | null) {
  const restaurant = useRestaurantStore()
  let generation = 0
  let disposed = false
  const detail = ref<DayClose | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const addingAnnotation = ref(false)
  const annotationError = ref<ApiError | null>(null)

  let controller: AbortController | null = null
  let targetId: number | null = null

  async function fetch(): Promise<void> {
    const token = ++generation
    const restaurantId = restaurant.currentRestaurantId
    const id = dayCloseId()
    controller?.abort()
    detail.value = null
    annotationError.value = null
    addingAnnotation.value = false
    if (id === null) {
      detail.value = null
      error.value = null
      loading.value = false
      return
    }
    controller = new AbortController()
    const { signal } = controller
    targetId = id
    loading.value = true
    error.value = null

    try {
      const result = await dayCloseService.get(id, signal)
      if (disposed || signal.aborted || targetId !== id || token !== generation || restaurantId !== restaurant.currentRestaurantId) return
      if (result.restaurant_id !== restaurantId) { error.value = { kind: 'not_found', status: 404 }; return }
      detail.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function retry(): void {
    void fetch()
  }

  /** §39 — appended locally from the real created response, never a full refetch (the annotation is the only thing that changed). */
  async function addAnnotation(body: string): Promise<boolean> {
    const token = generation
    const id = dayCloseId()
    if (id === null || !detail.value || addingAnnotation.value) return false
    addingAnnotation.value = true
    annotationError.value = null
    try {
      const annotation = await dayCloseService.addAnnotation(id, body)
      if (disposed || token !== generation) return false
      if (detail.value && detail.value.id === id) {
        detail.value = { ...detail.value, annotations: [...detail.value.annotations, annotation] }
      }
      return true
    } catch (err) {
      if (!disposed && token === generation) annotationError.value = normalizeApiError(err)
      return false
    } finally {
      if (!disposed && token === generation) addingAnnotation.value = false
    }
  }

  watch(() => [dayCloseId(), restaurant.currentRestaurantId], () => void fetch(), { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { disposed = true; ++generation; controller?.abort() })

  return { detail, loading, error, retry, addingAnnotation, annotationError, addAnnotation }
}
