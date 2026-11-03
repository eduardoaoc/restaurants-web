import type { OperationalTargetType } from './restaurant-operations'

export type OperationalEventType =
  | 'new_order'
  | 'order_ready'
  | 'waiter_requested'
  | 'bill_requested'
  | 'long_wait'

/** Ascending urgency: info < attention < critical. */
export type OperationalPriority = 'info' | 'attention' | 'critical'

/**
 * What a ring or badge *means* visually, independent of priority:
 * neutral (nothing active) · active (normal service) · attention (staff should
 * look) · urgent (act now) · checkout (bill / payment flow).
 */
export type OperationalVisualState = 'neutral' | 'active' | 'attention' | 'urgent' | 'checkout'

/**
 * Something that needs (or informs) staff, attached to one table or one guest.
 * `targetId` is a table id for `targetType: 'table'` and a guest id for
 * `targetType: 'guest'`.
 */
export interface OperationalEvent {
  id: string
  type: OperationalEventType
  targetType: OperationalTargetType
  targetId: string
  priority: OperationalPriority
  /** ISO-8601 timestamp. */
  createdAt: string
}

/** What a badge needs to draw one event. */
export interface OperationalBadgeModel {
  eventId: string
  label: string
  /** Importance — drives selection, not colour. */
  priority: OperationalPriority
  /** Meaning — drives the indicator colour. */
  visualState: OperationalVisualState
}
