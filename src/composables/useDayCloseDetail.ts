import { ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseService } from '@/services/day-close.service'
import type { DayClose } from '@/types/day-close'

/**
 * CARTA 9.1B §37 — a single persisted Cierre Diario, by its real numeric
 * `id` (verified against the OpenAPI `{dayClose}` path parameter schema —
 * `type: integer`, never `public_id`). Never recomputed: the whole point of
 * `GET /day-closes/{id}` is to render its own immutable `report` exactly as
 * stored, regardless of how the restaurant's live data has changed since.
 */
export function useDayCloseDetail(dayCloseId: () => number | null) {
  const detail = ref<DayClose | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const addingAnnotation = ref(false)
  const annotationError = ref<ApiError | null>(null)

  let controller: AbortController | null = null
  let targetId: number | null = null

  async function fetch(): Promise<void> {
    const id = dayCloseId()
    controller?.abort()
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
      if (signal.aborted || targetId !== id) return
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
    const id = dayCloseId()
    if (id === null || !detail.value) return false
    addingAnnotation.value = true
    annotationError.value = null
    try {
      const annotation = await dayCloseService.addAnnotation(id, body)
      if (detail.value && detail.value.id === id) {
        detail.value = { ...detail.value, annotations: [...detail.value.annotations, annotation] }
      }
      return true
    } catch (err) {
      annotationError.value = normalizeApiError(err)
      return false
    } finally {
      addingAnnotation.value = false
    }
  }

  watch(dayCloseId, () => void fetch(), { immediate: true })

  return { detail, loading, error, retry, addingAnnotation, annotationError, addAnnotation }
}
