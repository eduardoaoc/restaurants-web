import type { OperationalEvent } from '@/types/restaurant-3d/operational-event'
import type { RestaurantLayout } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState, RestaurantTableState } from '@/types/restaurant-3d/restaurant-operations'

/** Problems with one table's guest assignments (empty array = valid). */
export function validateTableState(seats: number, state: RestaurantTableState): string[] {
  const errors: string[] = []
  if (state.guests.length > seats) {
    errors.push(`${state.tableId}: ${state.guests.length} guests exceed ${seats} seats`)
  }
  const taken = new Set<number>()
  for (const guest of state.guests) {
    if (!Number.isInteger(guest.seatIndex) || guest.seatIndex < 0 || guest.seatIndex >= seats) {
      errors.push(`${state.tableId}: ${guest.id} has seatIndex ${guest.seatIndex}, but the table has seats 0–${seats - 1}`)
    } else if (taken.has(guest.seatIndex)) {
      errors.push(`${state.tableId}: seatIndex ${guest.seatIndex} is assigned more than once`)
    }
    taken.add(guest.seatIndex)
  }
  if (state.status === 'available') {
    if (state.occupiedAt !== null) errors.push(`${state.tableId}: an available table must have occupiedAt null`)
    if (state.guests.length > 0) errors.push(`${state.tableId}: an available table cannot have guests`)
  } else if (state.occupiedAt === null || Number.isNaN(Date.parse(state.occupiedAt))) {
    errors.push(`${state.tableId}: a ${state.status} table needs a valid occupiedAt`)
  }
  return errors
}

/** Whole-floor validation: tables, guest ids and the targets of events. */
export function validateOperationalState(
  layout: RestaurantLayout,
  state: RestaurantOperationalState,
  events: OperationalEvent[] = [],
): string[] {
  const errors: string[] = []
  const guestIds = new Set<string>()
  const tableIds = new Set(layout.tables.map((table) => table.id))

  for (const table of layout.tables) {
    const tableState = state[table.id]
    if (!tableState) continue
    errors.push(...validateTableState(table.seats, tableState))
    for (const guest of tableState.guests) {
      if (guestIds.has(guest.id)) errors.push(`duplicate guest id ${guest.id}`)
      guestIds.add(guest.id)
    }
  }
  for (const id of Object.keys(state)) {
    if (!tableIds.has(id)) errors.push(`state for unknown table ${id}`)
  }
  for (const event of events) {
    const known = event.targetType === 'table' ? tableIds.has(event.targetId) : guestIds.has(event.targetId)
    if (!known) errors.push(`${event.id}: unknown ${event.targetType} target ${event.targetId}`)
  }
  return errors
}
