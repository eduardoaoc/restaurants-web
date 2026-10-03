/**
 * Shapes confirmed against the live backend's real OpenAPI contract (CARTA
 * 9.1A):
 *   GET  /api/v1/restaurants/{restaurant}/cash-movements
 *   POST /api/v1/restaurants/{restaurant}/cash-movements   (Idempotency-Key)
 * A correction is an opposite movement — movements are never edited or
 * deleted by this API, so this frontend never offers to.
 */
export interface CashMovement {
  id: number
  restaurant_id: number
  type: 'pay_in' | 'pay_out'
  /** Decimal string, > 0. */
  amount: string
  reason: string
  recorded_by: { id: number | null; name: string }
  recorded_at: string
}

export interface CashMovementsResponse {
  period_started_at: string
  pay_ins_total: string
  pay_outs_total: string
  movements: CashMovement[]
}

export interface CreateCashMovementPayload {
  type: 'pay_in' | 'pay_out'
  /** Decimal string, > 0, max 2 decimals. */
  amount: string
  reason: string
}
