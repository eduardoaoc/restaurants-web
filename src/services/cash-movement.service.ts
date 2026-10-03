import { http } from '@/api/http'
import type { CashMovement, CashMovementsResponse, CreateCashMovementPayload } from '@/types/cash-movement'

interface CashMovementsEnvelope {
  data: CashMovementsResponse
}
interface CashMovementCreateEnvelope {
  data: CashMovement
}

/**
 * Thin wrapper around the real restaurants-api Cash Movements contract
 * (CARTA 9.1A):
 *   GET  /api/v1/restaurants/{restaurant}/cash-movements
 *   POST /api/v1/restaurants/{restaurant}/cash-movements   (Idempotency-Key —
 *        same key + same payload replays 200; same key + different payload
 *        is 409 IDEMPOTENCY_KEY_REUSED)
 * A correction is an opposite movement — there is no PATCH/DELETE here,
 * never add one.
 */
export const cashMovementService = {
  async list(restaurantId: number, signal?: AbortSignal): Promise<CashMovementsResponse> {
    const { data } = await http.get<CashMovementsEnvelope>(`/api/v1/restaurants/${restaurantId}/cash-movements`, { signal })
    return data.data
  },

  /**
   * Returns the created movement, but callers always refetch `list()`
   * right after anyway (§17/§44 — the period totals `pay_ins_total`/
   * `pay_outs_total` only come from `list()`, never recomputed
   * client-side), so this is only used to confirm the write succeeded.
   */
  async create(restaurantId: number, payload: CreateCashMovementPayload, idempotencyKey: string): Promise<CashMovement> {
    const { data } = await http.post<CashMovementCreateEnvelope>(
      `/api/v1/restaurants/${restaurantId}/cash-movements`,
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    return data.data
  },
}
