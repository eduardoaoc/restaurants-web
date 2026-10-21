import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { dailyOperationService } from '@/services/daily-operation.service'
import type { DailyOperationState } from '@/types/daily-operation'

/** Conflicts that mean "the world changed": show the fresh state, never replay. */
const STATE_CONFLICTS = ['DAILY_OPERATION_ALREADY_OPEN', 'BUSINESS_DATE_ALREADY_CLOSED', 'IDEMPOTENCY_KEY_REUSED']

/**
 * The operational day of the current restaurant. Reads are invoked by the
 * screen's existing realtime/fallback cycle (no timer here); a restaurant
 * switch aborts and drops everything from the previous one.
 *
 * Opening: one Idempotency-Key per attempt, kept across retries of the SAME
 * float (double click, timeout) so the backend replays instead of opening
 * twice; a different float or a domain conflict starts a fresh attempt.
 * The UI only ever shows the state the backend returned.
 */
export function useDailyOperation(restaurantId: () => number | null, enabled: () => boolean) {
  const state = ref<DailyOperationState | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const opening = ref(false)
  const openError = ref<ApiError | null>(null)

  let generation = 0
  let controller: AbortController | null = null
  let pending: Promise<void> | null = null
  let attempt: { key: string; float: string } | null = null

  function refetch(): Promise<void> {
    if (pending) return pending
    const id = restaurantId(), epoch = generation
    if (id === null || !enabled()) return Promise.resolve()
    const request = new AbortController()
    controller = request
    loading.value = true
    pending = (async () => {
      try {
        const result = await dailyOperationService.get(id, request.signal)
        if (epoch === generation && !request.signal.aborted) { state.value = result; error.value = null }
      } catch (err) {
        if (epoch === generation && !request.signal.aborted) error.value = normalizeApiError(err)
      } finally {
        if (epoch === generation) { loading.value = false; pending = null }
      }
    })()
    return pending
  }

  async function open(openingFloat: string): Promise<boolean> {
    const id = restaurantId(), epoch = generation
    if (id === null || !enabled() || opening.value) return false
    if (!attempt || attempt.float !== openingFloat) attempt = { key: crypto.randomUUID(), float: openingFloat }
    opening.value = true
    openError.value = null
    try {
      const result = await dailyOperationService.open(id, openingFloat, attempt.key)
      if (epoch !== generation) return false
      attempt = null
      state.value = result
      return true
    } catch (err) {
      if (epoch !== generation) return false
      const normalized = normalizeApiError(err)
      openError.value = normalized
      if (normalized.kind === 'validation' || STATE_CONFLICTS.includes(normalized.code ?? '')) attempt = null
      if (STATE_CONFLICTS.includes(normalized.code ?? '')) await refetch()
      return false
    } finally {
      if (epoch === generation) opening.value = false
    }
  }

  watch(() => [restaurantId(), enabled()] as const, () => {
    generation++
    controller?.abort()
    pending = null
    attempt = null
    state.value = null
    error.value = null
    openError.value = null
    loading.value = false
    opening.value = false
    void refetch()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { generation++; controller?.abort() })

  return { state, loading, error, opening, openError, refetch, open }
}
