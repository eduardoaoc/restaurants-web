import type { RestaurantGuestAssignment, RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/** `guest-<tableId>-<n>` guests on the given chair indexes. */
function seat(tableId: string, seatIndexes: number[]): RestaurantGuestAssignment[] {
  return seatIndexes.map((seatIndex, i) => ({ id: `guest-${tableId}-${i + 1}`, seatIndex }))
}

/** Mock "right now" for the seven tables of `mockLayout`. */
export const mockOperationalState: RestaurantOperationalState = {
  'table-1': { tableId: 'table-1', status: 'available', guests: [], occupiedAt: null },
  // 4-top: seats 0 and 1 are opposite each other. Already served, no events: green.
  'table-2': { tableId: 'table-2', status: 'eating', guests: seat('table-2', [0, 1]), occupiedAt: minutesAgo(52) },
  'table-3': { tableId: 'table-3', status: 'ordering', guests: seat('table-3', [0, 1, 2, 3]), occupiedAt: minutesAgo(12) },
  'table-4': { tableId: 'table-4', status: 'available', guests: [], occupiedAt: null },
  // 6 seats, 4 taken: chairs 2 and 5 stay empty.
  'table-5': { tableId: 'table-5', status: 'order_ready', guests: seat('table-5', [0, 1, 3, 4]), occupiedAt: minutesAgo(38) },
  'table-6': { tableId: 'table-6', status: 'bill_requested', guests: seat('table-6', [0, 1, 2, 3, 4, 5]), occupiedAt: minutesAgo(68) },
  'table-7': { tableId: 'table-7', status: 'waiter_requested', guests: seat('table-7', [0, 1, 2]), occupiedAt: minutesAgo(24) },
}
