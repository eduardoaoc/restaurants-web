/**
 * Operational (live) state of the 3D restaurant floor.
 *
 * Deliberately separate from `RestaurantTableConfig`: the config says what a
 * table physically *is* (where it stands, how many seats); the state says
 * what is happening at it *right now*. The two are joined by `tableId`.
 */

export type RestaurantTableStatus =
  | 'available'
  | 'occupied'
  | 'ordering'
  | 'eating'
  | 'order_pending'
  | 'order_ready'
  | 'waiter_requested'
  | 'bill_requested'

/** A guest sitting at a specific chair. The id is stable so events can target it. */
export interface RestaurantGuestAssignment {
  /** Stable id, e.g. `guest-table-5-1`. Unique across the whole floor. */
  id: string
  /** Index into the table's chairs (0 … seats − 1). Unique within the table. */
  seatIndex: number
}

export interface RestaurantTableState {
  tableId: string
  status: RestaurantTableStatus
  /**
   * Explicit seated guests; occupancy is `guests.length` (never stored
   * separately) and can never exceed the table's `seats`.
   */
  guests: RestaurantGuestAssignment[]
  /**
   * ISO-8601 time the party sat down; `null` while the table is available.
   * Only the timestamp is stored — elapsed time is always derived from it.
   */
  occupiedAt: string | null
}

/** Operational state keyed by table id. */
export type RestaurantOperationalState = Record<string, RestaurantTableState>

/**
 * What an operational event can be attached to. Anchors carry this pair in
 * their `userData`; `OperationalEvent` (operational-event.ts) targets them.
 */
export type OperationalTargetType = 'table' | 'guest'

export interface OperationalAnchorData {
  targetType: OperationalTargetType
  targetId: string
}

/** A seated guest, positioned in the owning table's local space. */
export interface RestaurantGuestPlacement {
  /** The guest assignment id. */
  id: string
  seatIndex: number
  x: number
  z: number
  /** Rotation around Y so the guest faces the table (radians). */
  rotationY: number
}
