/**
 * Shape confirmed against the live backend's OpenAPI contract (L5-swagger,
 * operationId `restaurantOperationsLive`) — GET
 * /api/v1/restaurants/{restaurant}/operations/live returns exactly this
 * shape. This is a read model computed fresh on every request: nothing here
 * is persisted or cached, and nothing here is ever recalculated client-side
 * (health_score, bottleneck, primary_status, flags are all backend-derived —
 * see CLAUDE.md's "critical rule" addendum). Money fields are decimal
 * strings, never numbers — format with src/utils/format.ts.
 */
export interface OperationsRestaurant {
  id: number
  name: string
  timezone: string
  currency: string
}

export interface OperationsSummary {
  tables: {
    total: number
    free: number
    occupied: number
    /** 0..1, already rounded by the backend — never recompute. */
    occupancy_rate: number
  }
  active_sessions: number
  active_guests: number
  orders: {
    active: number
    waiting_approval: number
    preparing: number
    ready: number
  }
  staff: {
    active: number
  }
  requests: {
    pending: number
  }
  sales: {
    /** SUM(PaymentRecord.amount) since local midnight — never Order totals. */
    received_today: string
  }
}

export type OperationHealthLevel = 'healthy' | 'attention' | 'critical'

export interface OperationsBottleneck {
  type: string
  severity: string
  affected_count: number
  oldest_age_seconds: number
}

export interface OperationsHealth {
  health_score: number
  health_level: OperationHealthLevel
  /** null when there are no alerts — a genuinely positive state, not "no data yet". */
  bottleneck: OperationsBottleneck | null
}

export interface TableLayout {
  x: number | null
  y: number | null
  rotation: number | null
  /** One of: round, square, rectangle. */
  shape: string | null
  width: number | null
  height: number | null
}

export interface TableAssignedWaiter {
  id: number
  name: string | null
  sub_id: string | null
}

export interface TableActiveSession {
  id: number
  started_at: string
  elapsed_seconds: number
  guest_count: number
  assigned_waiter: TableAssignedWaiter | null
}

export interface TableOrdersCounts {
  open_count: number
  waiting_approval: number
  preparing: number
  ready: number
}

export type TableBillingStatus = 'unpaid' | 'partial' | 'paid'

export interface TableBilling {
  total: string
  paid: string
  outstanding: string
  status: TableBillingStatus
}

/**
 * One of: free, occupied, waiting_approval, preparing, ready,
 * waiter_requested, bill_requested. There is deliberately no "reserved" /
 * "cleaning" / "waiting" status here — those exist in the HTML mockup but
 * not in this backend's domain (see CLAUDE.md §30) and must never be
 * fabricated on the frontend.
 */
export type TablePrimaryStatus =
  | 'free'
  | 'occupied'
  | 'waiting_approval'
  | 'preparing'
  | 'ready'
  | 'waiter_requested'
  | 'bill_requested'

/**
 * One of: unassigned, assigned_waiter_off_shift, assigned_waiter_suspended,
 * responsible_waiter_called, ready_order, waiting_approval, preparing_order,
 * bill_requested, waiter_requested. Treated as an open string union — the
 * backend may add flags without a frontend release; render unknown flags via
 * a generic fallback badge rather than dropping them silently.
 */
export type TableFlag = string

export interface OperationsTable {
  id: number
  name: string
  number: number | null
  capacity: number | null
  zone_id: number | null
  layout: TableLayout
  primary_status: TablePrimaryStatus
  flags: TableFlag[]
  session: TableActiveSession | null
  orders: TableOrdersCounts
  billing: TableBilling | null
}

export interface OperationsZone {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  tables: OperationsTable[]
}

export interface OperationsFloor {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  zones: OperationsZone[]
}

export interface OperationsStaffLoad {
  assigned_tables: number
  assigned_guests: number
  /** Open TableRequests + pending WaiterCalls across this waiter's assigned active sessions. */
  pending_attention: number
}

export interface OperationsStaffMember {
  user: { id: number; name: string | null }
  role: string | null
  shift_started_at: string
  active_seconds: number
  load: OperationsStaffLoad
}

export interface OperationsKitchen {
  counts_by_status: {
    waiting_approval: number
    confirmed: number
    accepted: number
    preparing: number
    ready: number
  }
  active_orders: number
  oldest_active_order_age_seconds: number | null
}

/**
 * One of: active_table_unassigned, assigned_waiter_off_shift,
 * assigned_waiter_suspended, customer_waiter_request_pending,
 * bill_request_pending, responsible_waiter_call_pending,
 * order_waiting_approval, order_ready.
 */
export type OperationsAlertType = string
export type OperationsAlertSeverity = 'info' | 'warning' | 'critical'

export interface OperationsAlert {
  /** Deterministic id, stable across snapshots of the same underlying fact — safe list :key. */
  id: string
  type: OperationsAlertType
  severity: OperationsAlertSeverity
  table_id: number | null
  table_session_id: number | null
  user_id: number | null
  age_seconds: number
}

export interface OperationsLiveSnapshot {
  restaurant: OperationsRestaurant
  generated_at: string
  summary: OperationsSummary
  operation: OperationsHealth
  floors: OperationsFloor[]
  /** Tables with no zone_id yet — must still render somewhere, never dropped. */
  unassigned_tables: OperationsTable[]
  staff: OperationsStaffMember[]
  kitchen: OperationsKitchen
  alerts: OperationsAlert[]
}
