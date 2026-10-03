/**
 * Shapes confirmed against the live backend's real OpenAPI contract and a
 * real `GET /restaurants/{restaurant}/day-close/preview` response (CARTA
 * 9.1A, restaurants-api — restaurants-web implements its frontend in CARTA
 * 9.1B against that exact contract, never inventing a field):
 *
 *   GET  /api/v1/restaurants/{restaurant}/day-close/preview?opening_float=
 *   POST /api/v1/restaurants/{restaurant}/day-closes            (Idempotency-Key)
 *   GET  /api/v1/restaurants/{restaurant}/day-closes             (cursor-paginated)
 *   GET  /api/v1/day-closes/{dayClose}                           (numeric id, verified via OpenAPI param schema)
 *   POST /api/v1/day-closes/{dayClose}/annotations
 *
 * Money is always a decimal string (e.g. "25.00"), never a number — same
 * convention as every other monetary field in this codebase. Instants are
 * UTC ISO-8601; `business_date`/`business_date_from` are calendar-only
 * ("YYYY-MM-DD").
 */

export interface DayCloseTableRef {
  id: number
  name: string
  number: number | null
}

export interface DayClosePeriod {
  business_date: string
  /** Earlier than business_date when the period covers days nobody closed. */
  business_date_from: string
  period_started_at: string
  /** Exclusive end. */
  period_ended_at: string
  timezone: string
  /** true: no previous close — activity before period_started_at is outside the closing system. */
  first_close: boolean
  covers_multiple_business_days: boolean
}

/** Every active table session blocks a normal close; `can_be_voided` is the ONLY in-place resolution this screen ever offers (never auto-close/cancel/void anything itself). */
export interface DayCloseActiveSessionBlocker {
  type: 'active_session'
  table_session_id: number
  table: DayCloseTableRef
  opened_at: string
  payment_status: string
  balance: string
  open_orders_count: number
  /** Empty session: POST /table-sessions/{id}/void resolves it. */
  can_be_voided: boolean
}

export interface DayCloseOtherBlocker {
  type: 'business_date_already_closed' | 'expected_cash_negative'
  [key: string]: unknown
}

export type DayCloseBlocker = DayCloseActiveSessionBlocker | DayCloseOtherBlocker

/**
 * Open union of warning kinds — the live contract confirms the enum below,
 * but only `active_staff_shifts`'s own extra fields (`count`, `staff[]`)
 * have been verified against a real response. Every other kind is rendered
 * generically (label + `count` when present) rather than guessing its
 * shape (CLAUDE.md §9).
 */
export type DayCloseWarningType =
  | 'open_table_requests_without_active_session'
  | 'active_staff_shifts'
  | 'products_still_unavailable'
  | 'critical_feedback'
  | 'severe_delays'
  | 'cash_difference'
  | (string & {})

export interface DayCloseWarningStaffEntry {
  user_id: number
  name: string
  started_at: string
}

export interface DayCloseWarning {
  type: DayCloseWarningType
  count?: number
  /** Only present on `active_staff_shifts` (verified live). */
  staff?: DayCloseWarningStaffEntry[]
  [key: string]: unknown
}

export interface DayCloseFinancial {
  currency: string
  total_received: string
  by_method: { cash: string; card: string; other: string }
  payments_count: number
  sessions_with_payments: number
  average_ticket: string
}

export interface DayClosePeakHour {
  local_hour: string
  sessions_started: number
}

export interface DayCloseOperations {
  orders: { registered: number; valid: number; served: number; rejected: number }
  sessions: { opened: number; closed: number; voided: number }
  guests: number
  peak_hour: DayClosePeakHour | null
}

export interface DayCloseTopProduct {
  product_id: number | null
  name: string
  quantity: number
}

export interface DayCloseProducts {
  /** Top 5 by quantity, billable orders. */
  top: DayCloseTopProduct[]
}

export interface DayCloseProductAvailabilityItem {
  restaurant_product_id: number
  product_name_snapshot: string | null
  /** false = "inicio desconocido" (no recorded event). */
  unavailable_since_known: boolean
  unavailable_at: string | null
  unavailable_by_name: string | null
  available_again_at: string | null
  available_again_by_name: string | null
  duration_seconds: number | null
  state_at_close: 'available' | 'unavailable'
}

export interface DayCloseProductAvailability {
  /** Distinct products. */
  count: number
  items: DayCloseProductAvailabilityItem[]
}

export interface DayCloseFeedbackItem {
  feedback_id: number
  submitted_at: string
  table: DayCloseTableRef | null
  table_session_id: number
  ratings: { overall: number; food: number; service: number; wait_time: number }
  /** User-generated; may itself contain PII — never attach a name/contact alongside it. */
  experience_comment: string | null
  improvement_comment: string | null
  waiter_name: string | null
}

export interface DayCloseFeedback {
  count: number
  avg_overall: string | null
  /** overall_rating < 3. */
  critical_count: number
  /** overall >= 3 with food/service/wait_time <= 2 — "aspectos que requieren atención", never called critical. */
  low_dimension_count: number
  critical: DayCloseFeedbackItem[]
  /** Up to 20. */
  attention: DayCloseFeedbackItem[]
}

export interface DayCloseDelayItem {
  order_id: number
  order_reference: string
  table: DayCloseTableRef | null
  stage: 'accept' | 'preparation' | 'ready_pickup'
  duration_seconds: number
  threshold_seconds: number
  excess_seconds: number
  /** The user who performed the closing action of the stage — never "the one responsible/culpable". */
  associated_action_user: { id: number; name: string } | null
  associated_action_label: 'marked_ready_by' | 'served_by' | null
}

export interface DayCloseDelays {
  thresholds_seconds: { accept: number; preparation: number; ready_pickup: number }
  total_count: number
  /** The 20 worst by excess. */
  items: DayCloseDelayItem[]
}

/**
 * Shared live/snapshot sections of a Cierre Diario — identical shape
 * whether read from the live `GET .../day-close/preview` or from a
 * persisted close's own immutable `report` (CARTA 9.1A's
 * `DayCloseSections`/`DayCloseReport` OpenAPI composition). Rendering both
 * through the one set of section components is reuse of an identical
 * contract, never a coincidental similarity.
 */
export interface DayCloseSections {
  financial: DayCloseFinancial
  operations: DayCloseOperations
  products: DayCloseProducts
  product_availability: DayCloseProductAvailability
  feedback: DayCloseFeedback
  delays: DayCloseDelays
}

export interface DayCloseCashPreview {
  suggested_opening_float: string | null
  opening_float_source: 'previous_close' | 'restaurant_default' | 'required'
  cash_received: string
  cash_pay_ins: string
  cash_pay_outs: string
  /** null while the opening float is required and not given via ?opening_float=. */
  expected_cash: string | null
  expected_cash_excluding_opening_float: string
  cash_difference_note_threshold: string
  movements: DayCloseCashMovementRef[]
}

/** Minimal shape read off preview.cash.movements — the full CashMovement (src/types/cash-movement.ts) is what the dedicated cash-movements endpoints return. */
export interface DayCloseCashMovementRef {
  id: number
  type: 'pay_in' | 'pay_out'
  amount: string
  reason: string
  recorded_at: string
  [key: string]: unknown
}

export interface DayClosePreview extends DayCloseSections {
  period: DayClosePeriod
  can_close: boolean
  blockers: DayCloseBlocker[]
  warnings: DayCloseWarning[]
  cash: DayCloseCashPreview
}

/** History row — persisted columns, never recomputed (CARTA 9.1A `DayCloseSummary`). */
export interface DayCloseSummary {
  id: number
  public_id: string
  restaurant_id: number
  business_date: string
  business_date_from: string
  period_started_at: string
  period_ended_at: string
  timezone: string
  currency: string
  total_received: string
  orders_valid: number
  guests: number
  cash_difference: string
  critical_feedback_count: number
  delays_count: number
  unavailable_products_count: number
  /** cash difference != 0, critical feedback, severe delay, product marked unavailable, or closing notes. */
  has_incidents: boolean
  closed_by: { id: number | null; name: string }
  closed_at: string
}

export interface DayCloseCashReport {
  opening_float: string
  opening_float_source: 'previous_close' | 'restaurant_default' | 'required'
  cash_received: string
  cash_pay_ins: string
  cash_pay_outs: string
  expected_cash: string
  counted_cash: string
  /** counted - expected (positive = sobrante, negative = faltante), computed by the server. */
  cash_difference: string
  cash_difference_note: string | null
  cash_difference_note_threshold: string
  cash_left_for_next_day: string | null
  movements: DayCloseCashMovementRef[]
}

export interface DayCloseReportClosing {
  public_id: string
  closed_by: { id: number | null; name: string }
  closed_at: string
  notes: string | null
}

/** The immutable snapshot stored at close time (schema_version 1) — never recomputed when rendering a past close (§37). */
export interface DayCloseReport extends DayCloseSections {
  schema_version: number
  summary: Record<string, unknown>
  cash: DayCloseCashReport
  warnings: DayCloseWarning[]
  closing: DayCloseReportClosing
}

/** A persisted Cierre Diario — DayCloseSummary fields plus every persisted column, the immutable report, and annotations. */
export interface DayClose extends DayCloseSummary {
  cash_received: string
  card_received: string
  other_received: string
  payments_count: number
  sessions_with_payments: number
  average_ticket: string
  opening_float: string
  cash_pay_ins: string
  cash_pay_outs: string
  expected_cash: string
  counted_cash: string
  cash_left_for_next_day: string | null
  cash_difference_note: string | null
  orders_registered: number
  orders_served: number
  orders_rejected: number
  sessions_opened: number
  sessions_closed: number
  feedback_count: number
  feedback_avg_overall: string | null
  low_dimension_feedback_count: number
  notes: string | null
  report_schema_version: number
  report_sha256: string
  report: DayCloseReport
  annotations: DayCloseAnnotation[]
  created_at: string
}

/** A post-close note — never part of the report/hash, never editable/removable from this UI (the API exposes no such endpoint). */
export interface DayCloseAnnotation {
  id: number
  body: string
  created_by: { id: number | null; name: string }
  created_at: string
}

/**
 * POST /restaurants/{restaurant}/day-closes body. `expected_cash_seen` is
 * always `preview.cash.expected_cash` as last read by the user — the
 * server recomputes and is the sole authority on the real expected cash
 * and the final difference (never trust a client-calculated total).
 */
export interface CreateDayClosePayload {
  period_started_at: string
  expected_cash_seen: string
  opening_float?: string
  counted_cash: string
  cash_left_for_next_day?: string
  cash_difference_note?: string
  notes?: string
}

export interface DayClosesQuery {
  from?: string
  to?: string
  closed_by?: number
  has_incidents?: boolean
  per_page?: number
  cursor?: string
}
