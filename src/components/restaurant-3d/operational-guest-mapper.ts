import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantGuestAssignment } from '@/types/restaurant-3d/restaurant-operations'

export interface OperationalSessionSnapshot {
  id: number
  guest_count: number
  status: string
  opened_at: string
}

export interface OperationalTableSnapshot {
  id: number
  restaurant_id: number
  primary_status: string
  session: OperationalSessionSnapshot | null
}

/**
 * Projects aggregate session occupancy into deterministic visual seats.
 * Unmapped layout tables deliberately produce no guest data. Capacity
 * overflow is rejected so callers cannot render occupants at invalid seats.
 */
export function mapOperationalGuests(
  layoutTable: RestaurantTableConfig,
  snapshot: OperationalTableSnapshot | null | undefined,
): RestaurantGuestAssignment[] {
  if (layoutTable.backendTableId == null || !snapshot || snapshot.id !== layoutTable.backendTableId || !snapshot.session) return []

  const { id: sessionId, guest_count: guestCount } = snapshot.session
  if (!Number.isSafeInteger(sessionId) || sessionId < 1) throw new RangeError('Invalid active session ID.')
  if (!Number.isSafeInteger(guestCount) || guestCount < 0) throw new RangeError('Invalid active session guest count.')
  if (guestCount > layoutTable.seats) throw new RangeError(`Session guest count (${guestCount}) exceeds visual capacity (${layoutTable.seats}).`)

  return Array.from({ length: guestCount }, (_, seatIndex) => ({
    id: `${sessionId}:seat:${seatIndex}`,
    seatIndex,
  }))
}
