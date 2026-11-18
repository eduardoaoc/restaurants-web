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
/**
 * Clear floor (m) between the chairs of two tables that a NEW placement or a move must leave: wide enough for a waiter with
 * a tray to pass and for a pulled-out chair. `CIRCULATION_MARGIN` stays the hard minimum used for framing and overlay
 * metrics; layouts saved under the older, tighter rule keep their positions and are only flagged (`findTightPairs`).
 */
export const COMFORT_MARGIN = 0.9

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

export function tableFootprint(table: Placed, margin: number = CIRCULATION_MARGIN): Footprint {
  const { width, depth } = getTableDimensions(table.shape, table.seats)
  const grow = CHAIR_CLEARANCE + margin / 2
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
export function findCollisions<T extends Placed & { id: string }>(table: Placed & { id: string }, others: T[], margin: number = COMFORT_MARGIN): T[] {
  const own = tableFootprint(table, margin)
  return others.filter((other) => other.id !== table.id && footprintsOverlap(own, tableFootprint(other, margin)))
}

/**
 * Pairs of an existing layout that are closer than the comfortable spacing (but may still clear the hard minimum).
 * Reporting only: nothing is moved, the person decides which one to nudge.
 */
export function findTightPairs<T extends Placed & { id: string }>(tables: readonly T[], margin: number = COMFORT_MARGIN): Array<[T, T]> {
  const pairs: Array<[T, T]> = []
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      if (footprintsOverlap(tableFootprint(tables[i]!, margin), tableFootprint(tables[j]!, margin))) pairs.push([tables[i]!, tables[j]!])
    }
  }
  return pairs
}
