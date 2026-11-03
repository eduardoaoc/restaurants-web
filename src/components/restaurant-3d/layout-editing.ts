import type { FloorPosition, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { FLOOR, FLOOR_EDGE_MARGIN, GRID_STEP } from './floor'
import { getTableDimensions } from './table-geometry'

/** Nearest grid line (e.g. 2.13 → 2.25, -1.88 → -2). */
export function snapToGrid(value: number, step = GRID_STEP): number {
  // `+ 0` turns -0 into 0 so snapped values print and compare cleanly.
  return Math.round(value / step) * step + 0
}

/** Rotation in degrees, wrapped to [0, 360). */
export function normalizeRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Footprint half-extents on the floor axes, for a table turned by `rotation`. */
function floorHalfExtents(table: Pick<RestaurantTableConfig, 'shape' | 'seats' | 'rotation'>): FloorPosition {
  const { width, depth } = getTableDimensions(table.shape, table.seats)
  const theta = (table.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(theta))
  const sin = Math.abs(Math.sin(theta))
  return { x: (cos * width + sin * depth) / 2, z: (sin * width + cos * depth) / 2 }
}

/**
 * Snaps a wanted position to the grid and keeps the tabletop (plus a chair
 * margin) on the floor. The limits are pulled inward to the grid, so a clamped
 * position is still on a grid line.
 */
export function snapAndClampToFloor(
  table: Pick<RestaurantTableConfig, 'shape' | 'seats' | 'rotation'>,
  wanted: FloorPosition,
): FloorPosition {
  const limits = floorLimits(table)
  const axis = (value: number, max: number) => snapToGrid(Math.min(max, Math.max(-max, snapToGrid(value))))
  return { x: axis(wanted.x, limits.x), z: axis(wanted.z, limits.z) }
}

/** How far from the floor centre (per axis, on the grid) this table's centre may sit. */
export function floorLimits(table: Pick<RestaurantTableConfig, 'shape' | 'seats' | 'rotation'>): FloorPosition {
  const half = floorHalfExtents(table)
  const limit = (floor: number, halfExtent: number) =>
    Math.max(0, Math.floor((floor / 2 - halfExtent - FLOOR_EDGE_MARGIN) / GRID_STEP) * GRID_STEP)
  return { x: limit(FLOOR.width, half.x), z: limit(FLOOR.depth, half.z) }
}

const EPSILON = 1e-9

export function isOnGrid(value: number, step = GRID_STEP): boolean {
  const steps = value / step
  return Math.abs(steps - Math.round(steps)) < EPSILON
}

export function isInsideFloor(table: Pick<RestaurantTableConfig, 'shape' | 'seats' | 'rotation' | 'position'>): boolean {
  const limits = floorLimits(table)
  return Math.abs(table.position.x) <= limits.x + EPSILON && Math.abs(table.position.z) <= limits.z + EPSILON
}
