/**
 * Shapes confirmed against the live backend's OpenAPI contract (Passo 3.5,
 * restaurants-api, tag "Customer Feedback"):
 *   GET /api/v1/restaurants/{restaurant}/feedback                          -> paginated CustomerFeedbackListItem[]
 *   GET /api/v1/feedback/{customerFeedback}                                 -> CustomerFeedback (full detail)
 *   GET /api/v1/me/feedback-summary                                        -> CustomerFeedbackSummary (own)
 *   GET /api/v1/restaurants/{restaurant}/staff/{staff}/feedback-summary    -> CustomerFeedbackSummary (one staff member)
 *
 * This is the CUSTOMER post-visit feedback system — deliberately never
 * conflated with the pre-existing StaffReview system (manage_staff_reviews,
 * "internal manager review of a staff member's shift"), which is a
 * completely different feature (see StaffPerformance.rating in staff.ts).
 * The list/detail endpoints are gated on `view_customer_feedback`
 * (owner/manager only today) — /me/feedback-summary needs no extra
 * permission (it's always the caller's own aggregate).
 */
export interface CustomerFeedbackTable {
  id: number
  name: string
  number: number | null
}

export interface CustomerFeedbackWaiter {
  id: number
  name: string
}

/** Minimal listing row — no comments/contact. See CustomerFeedback (GET .../feedback/{id}) for the full detail. */
export interface CustomerFeedbackListItem {
  id: number
  submitted_at: string
  customer_name: string
  table: CustomerFeedbackTable
  overall_rating: number
  food_rating: number
  service_rating: number
  wait_time_rating: number
  /** null when the visit had no assigned waiter — never omitted, render as "Sin camarero asignado". */
  waiter: CustomerFeedbackWaiter | null
}

export interface CustomerFeedbackPaginationMeta {
  current_page: number
  per_page: number
  total: number
  last_page: number
}

export interface CustomerFeedbackTableSession {
  id: number
  table: CustomerFeedbackTable
  opened_at: string
  closed_at: string | null
}

/** Full detail, including PII (first_name/last_name/contact) and free-text comments — gated by view_customer_feedback, owner/manager only. */
export interface CustomerFeedback {
  id: number
  restaurant: { id: number; name: string }
  table_session: CustomerFeedbackTableSession
  waiter: CustomerFeedbackWaiter | null
  first_name: string
  last_name: string
  wait_time_rating: number
  food_rating: number
  service_rating: number
  overall_rating: number
  experience_comment: string | null
  improvement_comment: string | null
  contact: string | null
  submitted_at: string
}

/** Aggregate-only — a waiter's own numbers, or an owner/manager consulting one staff member's numbers. NEVER individual rows or PII. `average_*` is null when `feedback_count` is 0. */
export interface CustomerFeedbackSummary {
  feedback_count: number
  average_overall: number | null
  average_service: number | null
  average_wait_time: number | null
  average_food: number | null
}
