import type { OperationalEvent, OperationalVisualState } from '@/types/restaurant-3d/operational-event'
import type { RestaurantTableStatus } from '@/types/restaurant-3d/restaurant-operations'

/**
 * Semantic operational colours — the ONLY place these hex values live. Rings
 * and badges read from here, so the same state always looks the same.
 *
 *   red    urgent    act now
 *   amber  attention staff should look
 *   green  active    normal service (seated, ordering, eating)
 *   blue   checkout  bill / payment flow
 *   grey   neutral   nothing active (no ring)
 *
 * `core` is the bright centre line of a ring, `glow` the saturated halo,
 * `outer` the deeper outermost halo; `dot` is the badge indicator.
 */
export interface VisualPalette {
  dot: string
  core: string
  glow: string
  outer: string
}

export const VISUAL_PALETTE: Record<OperationalVisualState, VisualPalette> = {
  neutral: { dot: '#b9b1a8', core: '#d9d3cc', glow: '#b9b1a8', outer: '#8f8880' },
  active: { dot: '#3ddc84', core: '#c4f7d8', glow: '#2fd47a', outer: '#1a9d58' },
  attention: { dot: '#ffc107', core: '#ffe9a0', glow: '#ffc107', outer: '#e09b00' },
  urgent: { dot: '#ff3b30', core: '#ffc2bd', glow: '#ff3b30', outer: '#c4160d' },
  checkout: { dot: '#3b9eff', core: '#c5e2ff', glow: '#2f8cff', outer: '#1a60d6' },
}

/** How a table status reads visually when no event overrides it. */
export const STATUS_VISUAL_STATE: Record<RestaurantTableStatus, OperationalVisualState> = {
  available: 'neutral',
  occupied: 'active',
  ordering: 'active',
  eating: 'active',
  order_pending: 'attention',
  order_ready: 'attention',
  waiter_requested: 'urgent',
  bill_requested: 'checkout',
}

/**
 * How an event reads visually. Priority is deliberately NOT the mapping
 * (a `critical` bill request is still blue); the one exception is `long_wait`,
 * whose urgency is exactly how long-overdue it is: critical → urgent,
 * otherwise attention.
 */
export function eventVisualState(event: Pick<OperationalEvent, 'type' | 'priority'>): OperationalVisualState {
  switch (event.type) {
    case 'new_order':
    case 'order_ready':
      return 'attention'
    case 'waiter_requested':
      return 'urgent'
    case 'bill_requested':
      return 'checkout'
    case 'long_wait':
      return event.priority === 'critical' ? 'urgent' : 'attention'
  }
}

/**
 * A table's ring: the visual state of the event its badge shows, so ring and
 * badge always agree; with no table event, the state of its status.
 */
export function tableVisualState(
  status: RestaurantTableStatus | undefined,
  topTableEvent?: Pick<OperationalEvent, 'type' | 'priority'>,
): OperationalVisualState {
  if (topTableEvent) return eventVisualState(topTableEvent)
  return status ? STATUS_VISUAL_STATE[status] : 'neutral'
}
