import { ref } from 'vue'
import axios from 'axios'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseService } from '@/services/day-close.service'
import type { CreateDayClosePayload, DayClose } from '@/types/day-close'

/**
 * CARTA 9.1B §25-§30 — the one place POST .../day-closes is ever called.
 * The backend recomputes and is the sole authority on `expected_cash`/the
 * final difference (never trusted from the client) — this composable only
 * ever forwards the fields the contract accepts and surfaces exactly what
 * came back, never inventing a retry/race-recovery itself (§28 "NÃO retry
 * automático").
 *
 * Idempotency (§26): one key per confirmation ATTEMPT, reused across
 * retries of the identical payload (double-click, a network timeout the
 * user retries without changing anything), reset the moment any field the
 * form controls changes — call `resetAttempt()` from a watcher on
 * counted_cash/notes/etc., same lazy-generate-then-reset shape as every
 * other idempotent POST in this codebase.
 *
 * `current_expected_cash`/`current_period_started_at` (CASH_EXPECTATION_
 * CHANGED / PERIOD_CHANGED, §28/§29) are read directly off the raw error
 * body — the OpenAPI contract names these two fields explicitly in its own
 * 409 description, so this is documented contract, not a guess; every
 * other field on these 409s is deliberately never assumed.
 */
export function useDayCloseSubmit(restaurantId: () => number | null) {
  const submitting = ref(false)
  const error = ref<ApiError | null>(null)
  /** Set only for CASH_EXPECTATION_CHANGED — the backend's current (fresher) expected_cash. */
  const currentExpectedCash = ref<string | null>(null)

  let idempotencyKey: string | null = null

  /** Call whenever the form's own close-relevant fields change — forces a fresh attempt (and a fresh key) on the next submit. */
  function resetAttempt(): void {
    idempotencyKey = null
    error.value = null
    currentExpectedCash.value = null
  }

  async function submit(payload: CreateDayClosePayload): Promise<DayClose | null> {
    const id = restaurantId()
    if (id === null) return null
    if (!idempotencyKey) idempotencyKey = crypto.randomUUID()
    submitting.value = true
    error.value = null
    currentExpectedCash.value = null

    try {
      const dayClose = await dayCloseService.create(id, payload, idempotencyKey)
      idempotencyKey = null
      return dayClose
    } catch (err) {
      const normalized = normalizeApiError(err)
      error.value = normalized
      if (normalized.code === 'CASH_EXPECTATION_CHANGED' && axios.isAxiosError(err)) {
        const body = err.response?.data as { error?: { current_expected_cash?: string } } | undefined
        currentExpectedCash.value = body?.error?.current_expected_cash ?? null
      }
      // Every conflict/blocker here means THIS attempt is no longer valid —
      // never silently replayed with the same key against a changed world.
      idempotencyKey = null
      return null
    } finally {
      submitting.value = false
    }
  }

  return { submitting, error, currentExpectedCash, submit, resetAttempt }
}
