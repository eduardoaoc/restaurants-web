import type { RestaurantLayout } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'

/**
 * Deterministic guest fixture for development/tests: seats `count` guests table by table, seat by
 * seat, in layout order. Explicit records only (never random); ids follow the mock convention
 * `guest-<tableId>-<n>` so appearance (derived from the id) is the same on every run.
 */
export function guestFixture(layout: RestaurantLayout, count: number): RestaurantOperationalState {
  const state: RestaurantOperationalState = {}
  let left = count
  for (const table of layout.tables) {
    const taking = Math.min(left, table.seats)
    left -= taking
    state[table.id] = {
      tableId: table.id,
      status: taking > 0 ? 'eating' : 'available',
      guests: Array.from({ length: taking }, (_, i) => ({ id: `guest-${table.id}-${i + 1}`, seatIndex: i })),
      occupiedAt: taking > 0 ? new Date(Date.now() - 15 * 60_000).toISOString() : null,
    }
  }
  return state
}
