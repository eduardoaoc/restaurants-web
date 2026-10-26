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
  RESTAURANT_DAY_NOT_OPEN: 'dailyOperation.errors.notOpen',
  DAILY_OPERATION_ALREADY_OPEN: 'dailyOperation.errors.alreadyOpen',
  INVALID_ORDER_ITEM: 'availability.invalidOrderItem',
  INVALID_MODIFIER_SELECTION: 'availability.invalidModifiers',
  PUBLIC_VISIT_INVALID: 'publicMenu.errors.visitInvalid',
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
  // Carta 4.6 hardening — PublicCartSheet's own footer already blocks this
  // in the common path (see `orderingEnabled` there); mapped here too as
  // defense-in-depth for the same reason every other code in this table is,
  // never the backend's raw (always-English) message reaching a customer.
  CUSTOMER_ORDERING_DISABLED: 'publicMenu.errors.orderingDisabled',
  // Passo 3.5 — public feedback conflicts. PublicFeedbackSheet handles these
  // three with dedicated states (never lets them reach this generic path in
  // the normal flow); mapped here too as defense-in-depth for any other
  // caller that only calls describeApiError().
  FEEDBACK_ALREADY_SUBMITTED: 'publicMenu.feedback.alreadySubmittedMessage',
  TABLE_SESSION_NOT_PAID_FOR_FEEDBACK: 'publicMenu.feedback.notPaidYet',
  FEEDBACK_TOKEN_NOT_FOUND: 'publicMenu.feedback.invalidToken',
  // Carta 5.1B — a fully paid TableSession 409s a new order or
  // request_bill (TableSessionAlreadyPaidException on the backend);
  // call_waiter was deliberately exempted from this in Carta 5.1C
  // (CreatePublicTableRequestAction) so "Quiero algo más" on the post-visit
  // screen can still succeed. This mapping stays as defense-in-depth for
  // request_bill/orders, which remain blocked once paid — the post-visit
  // CTA itself is gated purely on `visit.active`/capability (§13), never an
  // invented "already paid" rule, so any real 409 here still needs a clear,
  // localized reason.
  TABLE_SESSION_ALREADY_PAID: 'publicMenu.errors.alreadyPaid',
  // CARTA 9.1B — Cierre Diario. CLOSE_BLOCKED, CASH_EXPECTATION_CHANGED,
  // PERIOD_CHANGED and BUSINESS_DATE_ALREADY_CLOSED are deliberately NOT
  // mapped here: each needs structural handling (re-show blockers, a
  // before/after amount, a full refetch, an "open existing" action) that a
  // single generic banner string can't carry — the day-close screen reads
  // `error.code` directly for those instead, never this map.
  PERIOD_EMPTY: 'common.errors.codes.periodEmpty',
  IDEMPOTENCY_KEY_REUSED: 'common.errors.codes.idempotencyKeyReused',
  EXPECTED_CASH_NEGATIVE: 'common.errors.codes.expectedCashNegative',
  OPENING_FLOAT_MISMATCH: 'common.errors.codes.openingFloatMismatch',
  TABLE_SESSION_CLOSED: 'common.errors.codes.tableSessionNotActive',
  TABLE_SESSION_NOT_EMPTY: 'common.errors.codes.tableSessionNotEmpty',
  // Onboarding / invitations (restaurants-api InvitationException).
  // INVITATION_NOT_FOUND/EXPIRED/REVOKED/ALREADY_ACCEPTED are full-page
  // states on the accept screen (it reads error.code), not banner texts.
  INVITATION_ACCOUNT_EXISTS: 'invitation.errors.accountExists',
  INVITATION_ACCOUNT_REQUIRED: 'invitation.errors.accountRequired',
  INVITATION_ACCOUNT_SUSPENDED: 'invitation.errors.accountSuspended',
  INVITATION_NOT_ALLOWED_FOR_ACCOUNT: 'invitation.errors.notAllowed',
  INVITATION_ORGANIZATION_UNAVAILABLE: 'invitation.errors.organizationUnavailable',
  INVITATION_MEMBERSHIP_CONFLICT: 'invitation.errors.membershipConflict',
  INVITATION_ASSIGNMENT_CONFLICT: 'invitation.errors.assignmentConflict',
  INVITATION_NOT_PENDING: 'invitations.errors.notPending',
  INVITATION_RESEND_TOO_SOON: 'invitations.errors.tooSoon',
  INVITATION_ALREADY_PENDING: 'invitations.errors.alreadyPending',
  STAFF_ALREADY_MEMBER: 'staffInvitations.errors.alreadyMember',
  STAFF_MEMBERSHIP_INACTIVE: 'staffInvitations.errors.membershipInactive',
  ORGANIZATION_SUSPENDED: 'platform.onboarding.errors.organizationSuspended',
  ORGANIZATION_HAS_OWNER: 'platform.onboarding.errors.hasOwner',
  PASSWORD_RESET_INVALID: 'passwordReset.invalid',
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

  // A few domain codes ride on 403/429 (e.g. INVITATION_ACCOUNT_SUSPENDED,
  // INVITATION_RESEND_TOO_SOON); a known code is still more specific than
  // the generic text. Unknown codes on these kinds keep the generic text.
  if ((error.kind === 'forbidden' || error.kind === 'rate_limited') && error.code && KNOWN_ERROR_CODES[error.code]) {
    return t(KNOWN_ERROR_CODES[error.code])
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
