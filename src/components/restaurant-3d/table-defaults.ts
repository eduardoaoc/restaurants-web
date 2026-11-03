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

/**
 * Stable identity of a table: a UUID v4 minted when the table is created. The
 * backend accepts it as-is (it validates the format, never rewrites it), so
 * the id never changes between creation, save and reload. Falls back to
 * `getRandomValues` where `randomUUID` is unavailable (non-secure contexts).
 */
export function createTableId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
