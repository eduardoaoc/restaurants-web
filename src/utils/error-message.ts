import type { ApiError } from '@/api/errors'

/**
 * Known stable backend error codes (the {error:{code,message}} shape,
 * confirmed live — see src/api/errors.ts) mapped to a localized i18n key.
 * The backend's own `message` text is NOT localized (always English
 * regardless of Accept-Language — a real backend gap, documented in the
 * Passo 1.1 report) so codes we know about get a real translation; any
 * code not in this table still falls back to the backend's raw message
 * rather than a generic one, since that raw text is still more specific
 * and useful than nothing (see CLAUDE.md §13/§40 — never invent/hide the
 * real reason an action failed).
 */
const KNOWN_ERROR_CODES: Record<string, string> = {
  TABLE_SESSION_HAS_NO_BILLABLE_ORDERS: 'common.errors.codes.tableSessionHasNoBillableOrders',
  ZONE_HAS_TABLES: 'common.errors.codes.zoneHasTables',
  FLOOR_HAS_ZONES: 'common.errors.codes.floorHasZones',
  // Passo 3.4 — verified live against the real backend (bill/payment/close/table-request conflicts).
  TABLE_SESSION_HAS_OPEN_ORDERS: 'common.errors.codes.tableSessionHasOpenOrders',
  TABLE_REQUEST_ALREADY_OPEN: 'common.errors.codes.tableRequestAlreadyOpen',
  TABLE_SESSION_NOT_ACTIVE: 'common.errors.codes.tableSessionNotActive',
  // Passo 3.4 revalidation — verified live: POST .../orders 409s with this
  // once a bill has been requested for the session (customer QR surface
  // only; staff order creation is a different endpoint/Policy).
  TABLE_SESSION_BILL_REQUESTED: 'publicMenu.errors.billRequested',
  // Passo 3.5 — public feedback conflicts. PublicFeedbackSheet handles these
  // three with dedicated states (never lets them reach this generic path in
  // the normal flow); mapped here too as defense-in-depth for any other
  // caller that only calls describeApiError().
  FEEDBACK_ALREADY_SUBMITTED: 'publicMenu.feedback.alreadySubmittedMessage',
  TABLE_SESSION_NOT_PAID_FOR_FEEDBACK: 'publicMenu.feedback.notPaidYet',
  FEEDBACK_TOKEN_NOT_FOUND: 'publicMenu.feedback.invalidToken',
}

/**
 * Maps a normalized ApiError to human text for a toast/inline banner.
 * `conflict`/`validation` prefer, in order: a known error code's localized
 * text, then the backend's own raw message (409/422 bodies on this API
 * carry a real, specific business reason — "session is closed", "target
 * already has an active session", etc. — never re-derive that rule
 * client-side, see CLAUDE.md §13/§40), then a generic fallback. Every other
 * kind uses the generic, localized fallback since their raw messages are
 * not meant for display.
 */
export function describeApiError(error: ApiError, t: (key: string) => string): string {
  if (error.kind === 'conflict' || error.kind === 'validation') {
    const codeKey = error.code ? KNOWN_ERROR_CODES[error.code] : undefined
    if (codeKey) return t(codeKey)
    if (error.message) return error.message
  }

  switch (error.kind) {
    case 'forbidden':
      return t('common.errors.forbidden')
    case 'not_found':
      return t('common.errors.notFound')
    case 'conflict':
      return t('common.errors.conflict')
    case 'validation':
      return t('common.errors.validation')
    case 'rate_limited':
      return t('common.errors.rateLimited')
    case 'network':
      return t('common.errors.network')
    case 'server':
      return t('common.errors.server')
    default:
      return t('common.errors.generic')
  }
}
