/**
 * Shapes confirmed against the live backend's real response (Carta 6.1B,
 * restaurants-api App\Http\Resources\Api\V1\RestaurantActivityEventResource
 * / RestaurantActivityController / App\Support\Activity\RestaurantActivityType
 * — verified live, not guessed):
 *
 *   GET  /api/v1/restaurants/{restaurant}/activity              -> { data: { activity: RestaurantActivityEvent[] }, meta: RestaurantActivityMeta }
 *   GET  /api/v1/restaurants/{restaurant}/activity/unread-count  -> { data: RestaurantActivityReadState }
 *   POST /api/v1/restaurants/{restaurant}/activity/read          -> { data: RestaurantActivityReadState }
 *
 * The exact same `RestaurantActivityEvent` item shape is also what arrives
 * as the `activity` key of the `restaurant.activity.created` realtime
 * event (private channel `restaurant.{id}.activity`) — one contract, two
 * transports, never reconciled differently client-side.
 */

export type RestaurantActivityCategory = 'orders' | 'service' | 'billing' | 'tables' | 'menu'

export type RestaurantActivityTone = 'neutral' | 'positive' | 'warning' | 'critical'

/**
 * Every type the backend's own catalog (App\Support\Activity\
 * RestaurantActivityType::CATEGORY_BY_TYPE) currently defines — a closed
 * union on purpose (unlike PermissionSlug/TableFlag elsewhere): the
 * presentation map (utils/activity-presentation.ts) must be exhaustive
 * over exactly this set, so TypeScript forces every future addition here
 * to also get a localized label/icon, never a raw type string reaching
 * the UI.
 */
export type RestaurantActivityType =
  | 'order.created'
  | 'order.approved'
  | 'order.rejected'
  | 'order.accepted'
  | 'order.preparing'
  | 'order.ready'
  | 'order.served'
  | 'waiter_request.created'
  | 'waiter_request.acknowledged'
  | 'waiter_request.completed'
  | 'bill_request.created'
  | 'bill_request.acknowledged'
  | 'bill_request.completed'
  | 'payment.recorded'
  | 'table_session.opened'
  | 'table_session.closed'
  | 'product.marked_unavailable'
  | 'product.marked_available'

export type RestaurantActivityActorType = 'staff' | 'customer'

/** `id`/`name` are only ever present for `type === 'staff'` — an anonymous QR customer never has either (never invented, see ActivityActor on the backend). */
export interface RestaurantActivityActor {
  type: RestaurantActivityActorType
  id: number | null
  name: string | null
}

export interface RestaurantActivityTableRef {
  id: number
  name: string
}

/** `reference` is the already-formatted order number (e.g. "#1842") — never re-derived from `id`. */
export interface RestaurantActivityOrderRef {
  id: number
  reference: string
}

/**
 * Per-type metadata (App\Support\Activity\RestaurantActivityType::
 * METADATA_KEYS) — only the types listed below ever carry metadata, every
 * other type's `metadata` is `null`. Every key here is exactly what the
 * backend documents, nothing inferred:
 *   order.created         origin, initial_status, item_count, total
 *   payment.recorded      payment_id, amount, method
 *   table_session.opened  guest_count
 *   table_session.closed  total
 *   product.*             restaurant_product_id, product_name
 * Modeled as one open-ish record (rather than a per-type discriminated
 * union) since the resource itself sends a single untyped JSON object —
 * the presentation layer reads only the keys it knows for the event's own
 * `type`, never assumes a key exists.
 */
export interface RestaurantActivityMetadata {
  origin?: 'customer_qr' | 'waiter'
  initial_status?: string
  item_count?: number
  total?: string
  payment_id?: number
  amount?: string
  method?: string
  guest_count?: number
  restaurant_product_id?: number
  product_name?: string
}

export interface RestaurantActivityEvent {
  id: number
  type: RestaurantActivityType
  category: RestaurantActivityCategory
  /** Derived by the backend from `type` (never persisted, never re-derived client-side) — see RestaurantActivityType::TONE_BY_TYPE. */
  tone: RestaurantActivityTone
  /** ISO 8601 UTC. */
  occurred_at: string
  actor: RestaurantActivityActor
  table: RestaurantActivityTableRef | null
  table_session_id: number | null
  order: RestaurantActivityOrderRef | null
  table_request_id: number | null
  metadata: RestaurantActivityMetadata | null
}

export interface RestaurantActivityMeta {
  per_page: number
  next_cursor: string | null
  prev_cursor: string | null
  last_read_event_id: number
  unread_count: number
}

export interface RestaurantActivityReadState {
  last_read_event_id: number
  unread_count: number
}

/**
 * GET .../activity query filters — exactly IndexRestaurantActivityRequest's
 * own rules (category/type enums, from/to as ISO instants, cursor opaque,
 * per_page 1-100).
 */
export interface RestaurantActivityListParams {
  category?: RestaurantActivityCategory
  type?: RestaurantActivityType
  from?: string
  to?: string
  per_page?: number
  cursor?: string
}
