import { ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { cashMovementService } from '@/services/cash-movement.service'
import type { CashMovementsResponse, CreateCashMovementPayload } from '@/types/cash-movement'

/**
 * CARTA 9.1B §17/§18 — the current period's cash pay-ins/pay-outs. Same
 * restaurant-scoped gate/abort pattern as the rest of this screen.
 *
 * Idempotency (§18): one `Idempotency-Key` per submission attempt, reused
 * across retries of the SAME payload (e.g. a network timeout the user
 * retries without changing anything), replaced the moment the user edits
 * `type`/`amount`/`reason` again — same lazy-generate-then-reset shape
 * already used by PublicTableView's own order submission.
 */
export function useCashMovements(restaurantId: () => number | null, enabled: () => boolean) {
  const data = ref<CashMovementsResponse | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const submitting = ref(false)
  const submitError = ref<ApiError | null>(null)

  let controller: AbortController | null = null
  let targetRestaurantId: number | null = null
  let idempotencyKey: string | null = null

  async function fetch(): Promise<void> {
    const id = restaurantId()
    controller?.abort()
    if (id === null || !enabled()) {
      data.value = null
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
      const result = await cashMovementService.list(id, signal)
      if (signal.aborted || targetRestaurantId !== id) return
      data.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function refetch(): void {
    void fetch()
  }

  /** Call whenever the form's own type/amount/reason changes — forces a fresh attempt (and a fresh key) on the next submit. */
  function resetSubmission(): void {
    idempotencyKey = null
    submitError.value = null
  }

  async function submit(payload: CreateCashMovementPayload): Promise<boolean> {
    const id = restaurantId()
    if (id === null) return false
    if (!idempotencyKey) idempotencyKey = crypto.randomUUID()
    submitting.value = true
    submitError.value = null
    try {
      await cashMovementService.create(id, payload, idempotencyKey)
      idempotencyKey = null
      await fetch()
      return true
    } catch (err) {
      submitError.value = normalizeApiError(err)
      return false
    } finally {
      submitting.value = false
    }
  }

  watch(
    () => [restaurantId(), enabled()] as const,
    () => {
      resetSubmission()
      void fetch()
    },
    { immediate: true },
  )

  return { data, loading, error, submitting, submitError, refetch, submit, resetSubmission }
}
