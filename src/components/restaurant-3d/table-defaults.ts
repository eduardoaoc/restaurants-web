import type { FloorPosition, RestaurantTableConfig, RestaurantTableShape } from '@/types/restaurant-3d/restaurant-layout'
import { GRID_STEP } from './floor'
import { floorLimits } from './layout-editing'
import { findCollisions } from './table-footprint'

/** Capacities offered as one-click choices; anything else is "Personalizada". */
export const CAPACITY_PRESETS = [2, 4, 6, 8] as const

/** Sensible shape for a capacity: 2 → round, 4 → square, 6+ → rectangular. */
export function defaultShapeForSeats(seats: number): RestaurantTableShape {
  if (seats <= 2) return 'round'
  if (seats <= 4) return 'square'
  return 'rectangular'
}

/** Smallest positive number not used by any table. */
export function suggestTableNumber(tables: Pick<RestaurantTableConfig, 'number'>[]): number {
  const used = new Set(tables.map((table) => table.number))
  let candidate = 1
  while (used.has(candidate)) candidate += 1
  return candidate
}

let clientIdCounter = 0

/**
 * Client-side id for a table that has no backend id yet: `new-table-<uuid>`.
 * It is a string like every other id, serialisable, and the `new-` prefix lets
 * a later save tell client tables (to create) from persisted ones.
 */
export function createClientTableId(): string {
  const unique = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${(clientIdCounter += 1)}-${Math.random().toString(36).slice(2, 8)}`
  return `new-table-${unique}`
}

/**
 * Deterministic search of the grid for the free spot nearest to `near`
 * (default: floor centre). Every on-grid centre the table may occupy is tried
 * in order of distance (ties: smaller z, then smaller x); the first one that
 * collides with nothing wins. `null` when the floor has no room.
 */
export function findFreePosition(
  table: Pick<RestaurantTableConfig, 'shape' | 'seats' | 'rotation'>,
  others: RestaurantTableConfig[],
  near: FloorPosition = { x: 0, z: 0 },
): FloorPosition | null {
  const limits = floorLimits(table)
  const candidates: FloorPosition[] = []
  for (let x = -limits.x; x <= limits.x + 1e-9; x += GRID_STEP) {
    for (let z = -limits.z; z <= limits.z + 1e-9; z += GRID_STEP) {
      candidates.push({ x: Math.round(x / GRID_STEP) * GRID_STEP + 0, z: Math.round(z / GRID_STEP) * GRID_STEP + 0 })
    }
  }
  const distance = (p: FloorPosition) => Math.hypot(p.x - near.x, p.z - near.z)
  candidates.sort((a, b) => distance(a) - distance(b) || a.z - b.z || a.x - b.x)
  const probe = { ...table, id: '', position: { x: 0, z: 0 } }
  return candidates.find((position) => findCollisions({ ...probe, position }, others).length === 0) ?? null
}
