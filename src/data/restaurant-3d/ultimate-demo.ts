import type { RestaurantLayout } from '@/types/restaurant-3d/restaurant-layout'
import type { OperationalEvent } from '@/types/restaurant-3d/operational-event'
import type { RestaurantGuestAssignment, RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'

/**
 * Demo configuration for the Ultimate Pack room (dev fixture only): five 2-seat tables, chairs on opposite sides,
 * two staggered rows (two + three) on the open (south-east) half. The long counter (see UltimateEnvironment) sits
 * on the west half and the door is on the west wall, so the path entrance -> counter stays clear.
 */
export const ultimateDemoLayout: RestaurantLayout = {
  tables: [
    { id: 'table-1', number: 1, seats: 2, shape: 'square', position: { x: 0.0, z: 0.0 }, rotation: 0 },
    { id: 'table-2', number: 2, seats: 2, shape: 'square', position: { x: 4.0, z: 0.0 }, rotation: 0 },
    { id: 'table-3', number: 3, seats: 2, shape: 'square', position: { x: -2.0, z: 4.0 }, rotation: 0 },
    { id: 'table-4', number: 4, seats: 2, shape: 'square', position: { x: 2.0, z: 4.0 }, rotation: 0 },
    { id: 'table-5', number: 5, seats: 2, shape: 'square', position: { x: 6.0, z: 4.0 }, rotation: 0 },
  ],
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const seat = (tableId: string, seatIndexes: number[]): RestaurantGuestAssignment[] =>
  seatIndexes.map((seatIndex, i) => ({ id: `guest-${tableId}-${i + 1}`, seatIndex }))

export const ultimateDemoState: RestaurantOperationalState = {
  'table-1': { tableId: 'table-1', status: 'eating', guests: seat('table-1', [0, 1]), occupiedAt: minutesAgo(35) },
  'table-2': { tableId: 'table-2', status: 'available', guests: [], occupiedAt: null },
  'table-3': { tableId: 'table-3', status: 'ordering', guests: seat('table-3', [0, 1]), occupiedAt: minutesAgo(8) },
  'table-4': { tableId: 'table-4', status: 'bill_requested', guests: seat('table-4', [0]), occupiedAt: minutesAgo(50) },
  'table-5': { tableId: 'table-5', status: 'available', guests: [], occupiedAt: null },
}

export const ultimateDemoEvents: OperationalEvent[] = [
  { id: 'evt-1', type: 'new_order', targetType: 'table', targetId: 'table-3', priority: 'attention', createdAt: minutesAgo(2) },
  { id: 'evt-2', type: 'bill_requested', targetType: 'table', targetId: 'table-4', priority: 'attention', createdAt: minutesAgo(3) },
]
