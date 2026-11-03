import type { RestaurantOperationalState, RestaurantTableState } from '@/types/restaurant-3d/restaurant-operations'

/** What a table with no operational record is: free, nobody seated, no events. */
export const defaultTableState = (tableId: string): RestaurantTableState => ({
  tableId,
  status: 'available',
  guests: [],
  occupiedAt: null,
})

/** The recorded state of a table, or the default for one that has none (new / duplicated). */
export const resolveTableState = (state: RestaurantOperationalState, tableId: string): RestaurantTableState =>
  state[tableId] ?? defaultTableState(tableId)

/** Smallest capacity that still holds everyone seated: highest occupied seat index + 1 (0 if empty). */
export const minSeatsForState = (state: RestaurantOperationalState, tableId: string): number =>
  Math.max(0, ...(state[tableId]?.guests.map((guest) => guest.seatIndex + 1) ?? []))
