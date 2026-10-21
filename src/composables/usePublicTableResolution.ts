import { onBeforeUnmount, ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { publicTableService } from '@/services/public-table.service'
import type { PublicTableResolution } from '@/types/public-menu'

/**
 * Initial QR navigation explicitly enters/resumes the visit via POST.
 * Once entered, every refresh/poll is a pinned GET. Failed entry has one
 * manual retry path; simultaneous callers share the pending operation.
 */
export function usePublicTableResolution(publicToken: string) {
  const resolution = ref<PublicTableResolution | null>(null)
  const loading = ref(true)
  const error = ref<ApiError | null>(null)
  /**
   * Entry refused with RESTAURANT_DAY_NOT_OPEN. While set, background
   * reloads never POST /enter again: a page left open must not create a
   * session by itself once the day opens. Only retryEntry() (an explicit
   * customer tap) tries again.
   */
  const serviceClosed = ref(false)

  let controller: AbortController | null = null
  let retryAt = 0
  let entered = false
  let pending: Promise<void> | null = null

  async function performLoad(): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    loading.value = true
    error.value = null

    try {
      const result = entered
        ? await publicTableService.resolveTable(publicToken, signal)
        : await publicTableService.enterTable(publicToken)
      entered = true
      if (signal.aborted) return
      retryAt = 0
      serviceClosed.value = false
      resolution.value = result
    } catch (err) {
      if (signal.aborted) return
      const failure = normalizeApiError(err)
      if (!entered && failure.code === 'RESTAURANT_DAY_NOT_OPEN') serviceClosed.value = true
      retryAt = Date.now() + (failure.retryAfterSeconds ?? 0) * 1000
      // Keep the pinned snapshot through transient failures so its single
      // reconciliation timer can retry without forgetting the visit.
      if (!entered || ['forbidden', 'unauthenticated', 'not_found'].includes(failure.kind) || failure.code === 'PUBLIC_VISIT_INVALID') resolution.value = null
      error.value = failure
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function load(): Promise<void> {
    if (pending) return pending
    if (serviceClosed.value) return Promise.resolve()
    if (Date.now() < retryAt) return Promise.resolve()
    pending = performLoad().finally(() => { pending = null })
    return pending
  }

  void load()
  onBeforeUnmount(() => controller?.abort())

  async function beginNewVisit(): Promise<void> {
    if (pending) await pending
    entered = false
    resolution.value = null
    await load()
  }

  function retryEntry(): Promise<void> {
    serviceClosed.value = false
    retryAt = 0
    return load()
  }

  return { resolution, loading, error, serviceClosed, reload: load, retryEntry, beginNewVisit }
}
