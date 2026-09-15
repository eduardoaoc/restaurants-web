/**
 * Shapes confirmed against the live backend's OpenAPI contract (Passo 3.1,
 * restaurants-api `develop`, tag "Public") — the customer-facing QR
 * surface, entirely separate from every admin type in this app:
 *
 *   GET  /api/v1/public/tables/{publicToken}          -> PublicTableResolution
 *   GET  /api/v1/public/tables/{publicToken}/menu      -> PublicMenu
 *   POST /api/v1/public/tables/{publicToken}/orders    -> PublicOrderCreated
 *
 * None of these require a session cookie or any admin permission — the
 * `publicToken` in the URL is the ONLY identifier the customer's phone ever
 * carries (Table::public_token, a 48-char random string, never the table's
 * numeric id). No field here was invented: every property matches the real
 * OpenAPI schema names/requiredness exactly (PublicRestaurant, PublicTable,
 * PublicSessionState, PublicCategory, PublicProduct, PublicModifierGroup,
 * PublicModifierOption, PublicOrderCreateRequest, OrderItemCreateRequest,
 * PublicOrderCreated, OrderItem, OrderItemModifier).
 */

/**
 * `capabilities` never includes `customer_order_requires_approval` — the
 * backend alone decides an order's resulting status, the frontend never
 * pre-announces it (see PublicOrderCreated.status instead).
 */
export interface PublicRestaurantCapabilities {
  customer_ordering: boolean
  waiter_call: boolean
  bill_request: boolean
}

export interface PublicRestaurant {
  id: number
  name: string
  default_locale: string
  enabled_locales: string[]
  capabilities: PublicRestaurantCapabilities
}

export interface PublicTable {
  id: number
  name: string
  number: number | null
}

/**
 * Present for the whole lifetime of the table's active session, unpaid or
 * paid — the feedback token is minted at session-open, not at payment,
 * precisely so the client can persist it well before any payment happens
 * (Passo 3.5, confirmed live against the real backend). `eligible` alone
 * reflects whether the visit is paid yet and is backend-authoritative —
 * holding `token` while `eligible` is false does NOT let
 * POST /public/feedback/{token} succeed early; the backend re-checks
 * payment status on every call, never trust a stale local copy of this
 * flag once the session goes inactive (see usePublicFeedbackToken.ts).
 * `token`/`already_submitted` are absent (only `eligible: false`) once the
 * table has no active session at all — this is exactly why the token must
 * be captured client-side the moment it appears, never re-derived later.
 */
export interface PublicSessionFeedback {
  eligible: boolean
  token?: string | null
  already_submitted?: boolean | null
}

/** `status` is opaque/best-effort display text (e.g. "occupied") — never matched against a hardcoded value list. */
export interface PublicSessionState {
  active: boolean
  status: string | null
  feedback: PublicSessionFeedback
}

export interface PublicTableResolution {
  restaurant: PublicRestaurant
  table: PublicTable
  session: PublicSessionState
  menu: { available: boolean }
}

export interface PublicModifierOption {
  id: number
  name: string
  description: string | null
  /** Decimal string, e.g. "1.50" — same read shape as every other money field in this app. */
  price_delta: string
}

export interface PublicModifierGroup {
  id: number
  name: string
  description: string | null
  required: boolean
  min_select: number
  max_select: number
  options: PublicModifierOption[]
}

/**
 * Already filtered to what's publicly orderable — the public menu
 * serialization does not expose an `available` flag at all (unlike the
 * admin RestaurantProduct), so there is nothing to gray out here: a
 * product simply isn't in the response if it can't be ordered right now.
 */
export interface PublicProduct {
  restaurant_product_id: number
  product_id: number
  name: string
  description: string | null
  /** Decimal string, e.g. "12.90". */
  price: string
  modifier_groups: PublicModifierGroup[]
}

export interface PublicCategory {
  id: number
  slug: string
  name: string
  description: string | null
  products: PublicProduct[]
}

export interface PublicMenu {
  restaurant: PublicRestaurant
  table: PublicTable
  session: PublicSessionState
  /** The locale the backend actually resolved the content to (never assume it echoes the request as-is). */
  locale: string
  menu: {
    id: number
    categories: PublicCategory[]
  }
}

/** POST .../orders item — matches OrderItemCreateRequest exactly (quantity 1..50, enforced server-side too). */
export interface PublicOrderItemPayload {
  restaurant_product_id: number
  quantity: number
  note?: string | null
  modifier_option_ids?: number[]
}

/**
 * The full POST body. Deliberately never carries `restaurant_id`/`table_id`/
 * `user_id`/`customer_id` — the backend derives all of that from the
 * `publicToken` in the URL alone (CLAUDE.md §29/§19 for this Passo).
 */
export interface PublicOrderCreateRequest {
  customer_name?: string | null
  locale?: string
  note?: string | null
  items: PublicOrderItemPayload[]
}

export interface PublicOrderItemModifier {
  id: number
  modifier_group_id: number | null
  modifier_option_id: number | null
  group_name: string
  name: string
  price_delta: string
}

/** A line as the backend echoes it back — snapshotted at order time, never the product's current live name/price. */
export interface PublicOrderItem {
  id: number
  restaurant_product_id: number
  product_id: number | null
  name: string
  description: string | null
  unit_price: string
  quantity: number
  modifiers_unit_total: string
  unit_total: string
  line_total: string
  note: string | null
  modifiers: PublicOrderItemModifier[]
}

/**
 * `status` is whatever the backend actually assigned (e.g.
 * "waiting_approval" when the restaurant's `customer_order_requires_approval`
 * setting is on, something else otherwise) — the UI must read this, never
 * assume/announce a status ahead of the response (CLAUDE.md §21 for this
 * Passo).
 */
export interface PublicOrderCreated {
  id: number
  order_number: string
  status: string
  subtotal: string
  modifiers_total: string
  total: string
  items: PublicOrderItem[]
}

/** The uniform {error:{code,message}} shape every public endpoint uses on failure — same as the admin API's own domain-conflict shape, already handled by src/api/errors.ts's normalizeApiError. */
export interface PublicApiError {
  error: {
    code: string
    message: string
  }
}

/**
 * POST /public/tables/{token}/requests/bill|call-waiter response (Passo
 * 3.4) — deliberately minimal (no restaurant/table echo, unlike the admin
 * TableRequest resource): the public surface never needs more than "it was
 * created" to show a confirmation. `type` is whatever the backend actually
 * assigned (e.g. "bill_request"/"call_waiter") — read, never guessed.
 */
export interface PublicTableRequest {
  id: number
  type: string
  status: string
  created_at: string
}
