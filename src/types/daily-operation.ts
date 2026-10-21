/**
 * GET /api/v1/restaurants/{restaurant}/daily-operation (restaurants-api
 * DailyOperationController / DailyOperationState). `cash` is only present
 * for users who can open or close the day — never assume it.
 */
export interface DailyOperationPublic {
  /** Public uuid of the operation. */
  id: string
  status: 'open' | 'closed'
  /** Y-m-d in the restaurant timezone (business-day cutoff applied). */
  business_date: string
  timezone: string
  opened_at: string
  opened_by: { name: string }
  closed_at: string | null
  closed_by: { name: string } | null
}

export type OpeningFloatSuggestionSource = 'previous_close' | 'restaurant_default' | 'required'

export interface DailyOperationCash {
  currency: string
  suggested_opening_float: string | null
  suggested_opening_float_source: OpeningFloatSuggestionSource
  /** Present only while a day is open. */
  opening_float?: string
  /** Customer receipts of the open day — never includes the opening float. */
  received?: string
  cash_received?: string
  payments_count?: number
  sessions_opened?: number
}

export interface DailyOperationState {
  status: 'open' | 'not_open'
  current: DailyOperationPublic | null
  last_close: { business_date: string; closed_at: string } | null
  /** What an opening right now would be labelled; null while open. */
  next_business_date: string | null
  can: { open: boolean; close: boolean }
  cash?: DailyOperationCash
}

/** Non-financial block of GET /operations/live. */
export type OperationsDailyOperation = DailyOperationPublic | { status: 'not_open' }

export type OperationsSalesCard =
  | { state: 'open'; business_date: string; received: string }
  | { state: 'closed'; business_date: string; closed_at: string; received: string }
  | { state: 'none' }
