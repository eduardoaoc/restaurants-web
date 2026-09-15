/**
 * Shapes confirmed against the live backend's OpenAPI contract (Passo 3.5,
 * restaurants-api, tag "Public"):
 *   GET  /api/v1/public/feedback/{feedbackToken}  -> PublicFeedbackContext
 *   POST /api/v1/public/feedback/{feedbackToken}  -> PublicFeedback
 *
 * `feedbackToken` (session.feedback.token from PublicSessionState, see
 * public-menu.ts) is the ONLY key either endpoint accepts — never
 * table_session_id/table_id/the table's own public_token. Neither endpoint
 * requires a session cookie or any admin permission, same anonymous model
 * as every other public.* type in this app.
 */

/** Minimal context for the public feedback form — never exposes internal ids, the table's own public_token, financial data, or staff identities. */
export interface PublicFeedbackContext {
  already_submitted: boolean
  restaurant: { name: string }
  table: { name: string }
}

/**
 * POST body. Ratings are integers 1-5 (enforced server-side too — 422 on
 * out-of-range). Only first_name/last_name/the four ratings are required;
 * the rest are optional and nullable, never invented beyond this exact set.
 */
export interface CreatePublicFeedbackRequest {
  first_name: string
  last_name: string
  wait_time_rating: number
  food_rating: number
  service_rating: number
  overall_rating: number
  experience_comment?: string | null
  improvement_comment?: string | null
  contact?: string | null
}

/** Confirmation echoed back on success (201 create, or 200 on an idempotent replay of an identical payload). */
export interface PublicFeedback {
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
