import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { CHAIR_SEAT_SIZE, CHAIR_SETBACK, getTableDimensions } from './table-geometry'

/**
 * Basic 2D (X/Z) collision utilities. A table's footprint is its rotated
 * tabletop grown by the chair area and half the circulation margin, so two
 * footprints that do not overlap leave at least `CIRCULATION_MARGIN` of clear
 * floor between their chairs. Round tables use their bounding square. This is
 * an approximation, not physics.
 */
export const CHAIR_CLEARANCE = CHAIR_SETBACK + CHAIR_SEAT_SIZE / 2
export const CIRCULATION_MARGIN = 0.5

type Placed = Pick<RestaurantTableConfig, 'shape' | 'seats' | 'rotation' | 'position'>

interface Footprint {
  x: number
  z: number
  halfX: number
  halfZ: number
  /** Unit vectors of the table's local X and Z axes on the floor. */
  axisX: [number, number]
  axisZ: [number, number]
}

export function tableFootprint(table: Placed): Footprint {
  const { width, depth } = getTableDimensions(table.shape, table.seats)
  const grow = CHAIR_CLEARANCE + CIRCULATION_MARGIN / 2
  const theta = (table.rotation * Math.PI) / 180
  return {
    x: table.position.x,
    z: table.position.z,
    halfX: width / 2 + grow,
    halfZ: depth / 2 + grow,
    // Same convention as three.js' rotation.y.
    axisX: [Math.cos(theta), -Math.sin(theta)],
    axisZ: [Math.sin(theta), Math.cos(theta)],
  }
}

/** Separating-axis test for two rotated rectangles; touching edges do not overlap. */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const radius = (f: Footprint, u: [number, number]) =>
    Math.abs(u[0] * f.axisX[0] + u[1] * f.axisX[1]) * f.halfX + Math.abs(u[0] * f.axisZ[0] + u[1] * f.axisZ[1]) * f.halfZ
  for (const axis of [a.axisX, a.axisZ, b.axisX, b.axisZ]) {
    if (Math.abs(dx * axis[0] + dz * axis[1]) >= radius(a, axis) + radius(b, axis) - 1e-9) return false
  }
  return true
}

/** The tables in `others` (never `table` itself, matched by id) that `table` collides with. */
export function findCollisions<T extends Placed & { id: string }>(table: Placed & { id: string }, others: T[]): T[] {
  const own = tableFootprint(table)
  return others.filter((other) => other.id !== table.id && footprintsOverlap(own, tableFootprint(other)))
}
