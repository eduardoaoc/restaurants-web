/**
 * Shape confirmed against the live backend (restaurants-api,
 * app/Events/Realtime/*.php, docs/realtime.md) — Passo 1.3. Every event
 * extends `RealtimeEvent`, which fixes this envelope and appends the
 * event's own small, explicit payload at the same level (never nested
 * under a `payload` key, and never a raw Eloquent model). `broadcastAs()`
 * is the stable wire name below — never the PHP class name.
 */
export interface RealtimeEventEnvelope {
  event_id: string
  schema_version: number
  /** ISO 8601 UTC — convert to the restaurant's own timezone for display, same as everywhere else in this app. */
  occurred_at: string
  restaurant_id: number
  [key: string]: unknown
}

/**
 * Every wire event name the backend actually broadcasts today (verified
 * against every `broadcastAs()` in app/Events/Realtime/*.php — not
 * guessed, not copied from docs alone). Deliberately NOT an open union
 * like PermissionSlug/TableFlag elsewhere: these names are the literal
 * contract this composable's `.listen()` calls are wired to, so a typo
 * here should be a compile error, not a silently-ignored channel event.
 */
export type RealtimeEventName =
  | 'table.session.opened'
  | 'table.session.closed'
  | 'table.session.transferred'
  | 'table.waiter.assigned'
  | 'table.waiter.reassigned'
  | 'table.waiter.unassigned'
  | 'staff.shift.started'
  | 'staff.shift.ended'
  | 'order.created'
  | 'order.status_changed'
  | 'table_request.created'
  | 'table_request.acknowledged'
  | 'waiter_call.created'
  | 'waiter_call.acknowledged'
  | 'payment.recorded'
  | 'floor_plan.updated'

/**
 * docs/realtime.md's own event catalog, transcribed exactly (Event →
 * Triggering Action) so the mapping lives in one typed place instead of
 * scattered across listener registrations.
 */
export const REALTIME_EVENT_NAMES: readonly RealtimeEventName[] = [
  'table.session.opened',
  'table.session.closed',
  'table.session.transferred',
  'table.waiter.assigned',
  'table.waiter.reassigned',
  'table.waiter.unassigned',
  'staff.shift.started',
  'staff.shift.ended',
  'order.created',
  'order.status_changed',
  'table_request.created',
  'table_request.acknowledged',
  'waiter_call.created',
  'waiter_call.acknowledged',
  'payment.recorded',
  'floor_plan.updated',
]

/**
 * Every event that should trigger a coalesced refetch of
 * GET /operations/live (Passo 1.3 §5/§19). docs/realtime.md says
 * "structural" events (table.session.transferred, floor_plan.updated)
 * need a full refetch because their payload is intentionally too small to
 * patch local state from, while "simple" events (staff.shift.started,
 * order.status_changed, ...) *could* be patched locally. This app
 * deliberately refetches for all of them: operations/live is the single
 * authoritative read model driving the whole Operation tab (health score,
 * bottleneck, alerts, capacity — all backend-derived), and patching a
 * subset locally would mean re-deriving some of that domain logic on the
 * frontend, which CLAUDE.md's own "critical rule" forbids. One coalesced
 * GET is cheap; duplicated domain logic is not — see docs/realtime.md's
 * "prioritize consistency" guidance.
 */
export const EVENTS_REQUIRING_OPERATIONS_REFRESH: readonly RealtimeEventName[] = REALTIME_EVENT_NAMES

export type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unavailable'
  | 'error'
