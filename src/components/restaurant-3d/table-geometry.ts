import type { RestaurantGuestAssignment, RestaurantGuestPlacement } from '@/types/restaurant-3d/restaurant-operations'
import type {
  RestaurantTableConfig,
  RestaurantTableSeats,
  RestaurantTableShape,
} from '@/types/restaurant-3d/restaurant-layout'

/** Shared dimensions (metres) — the single place chair/table sizing lives. */
export const TABLE_HEIGHT = 0.75
export const TABLE_TOP_THICKNESS = 0.05
export const CHAIR_SEAT_SIZE = 0.44
export const CHAIR_SEAT_HEIGHT = 0.45
export const CHAIR_BACK_HEIGHT = 0.42
/** How far a chair's centre sits beyond the table edge (slightly tucked in). */
export const CHAIR_SETBACK = 0.18
/** Linear space reserved per diner along a table edge. */
const SEAT_PITCH = 0.6

/** Theme-invariant scene colours — kept together so they are never inlined. */
export const SCENE_COLORS = {
  tableTop: '#d8c3a5',
  tableBase: '#3a3a3c',
  chair: '#6b4a2e',
  guest: '#e6dfd4',
} as const

/** Height (m, in each parent's local space) of the logical notification anchors. */
export const TABLE_ANCHOR_HEIGHT = 1.9
export const GUEST_ANCHOR_HEIGHT = 1.5

export interface TableDimensions {
  /** Footprint along the table's local X axis. */
  width: number
  /** Footprint along the table's local Z axis. */
  depth: number
}

export interface ChairPlacement {
  x: number
  z: number
  /** Rotation around Y so the chair faces the table (radians). */
  rotationY: number
}

export function getTableDimensions(
  shape: RestaurantTableShape,
  seats: RestaurantTableSeats,
): TableDimensions {
  if (shape === 'round') {
    const diameter = Math.max(0.8, (seats * SEAT_PITCH) / Math.PI + 0.3)
    return { width: diameter, depth: diameter }
  }

  if (shape === 'square') {
    const perSide = Math.ceil(seats / 4)
    const side = seats <= 2 ? 0.8 : perSide * SEAT_PITCH + 0.3
    return { width: side, depth: side }
  }

  const perLongSide = Math.ceil((seats - endSeats(seats)) / 2)
  const length = Math.max(1.2, perLongSide * SEAT_PITCH + 0.3)
  const width = seats < 6 ? 0.8 : seats <= 8 ? 0.9 : 1.0
  return { width: length, depth: width }
}

/** Rectangular tables only seat someone at the short ends from 6 seats up. */
function endSeats(seats: number): number {
  return seats >= 6 ? 2 : 0
}

/** Evenly spread `count` chairs along an edge of the given length. */
function spread(count: number, length: number): number[] {
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * length - length / 2)
}

/** Chair facing the table when sitting on the side whose outward normal is (nx, nz). */
function facing(nx: number, nz: number): number {
  return Math.atan2(-nx, -nz)
}

function squareChairs(seats: number, { width, depth }: TableDimensions): ChairPlacement[] {
  // Sides in fill order: front (+z), back (-z), right (+x), left (-x).
  const sides = [
    { nx: 0, nz: 1 },
    { nx: 0, nz: -1 },
    { nx: 1, nz: 0 },
    { nx: -1, nz: 0 },
  ]
  return sides.flatMap(({ nx, nz }, index) => {
    const count = Math.floor(seats / 4) + (index < seats % 4 ? 1 : 0)
    const along = nz !== 0 ? width : depth
    return spread(count, along).map((offset) => ({
      x: nz !== 0 ? offset : nx * (width / 2 + CHAIR_SETBACK),
      z: nz !== 0 ? nz * (depth / 2 + CHAIR_SETBACK) : offset,
      rotationY: facing(nx, nz),
    }))
  })
}

function rectangularChairs(seats: number, { width, depth }: TableDimensions): ChairPlacement[] {
  const ends = endSeats(seats)
  const longSeats = seats - ends
  const front = Math.ceil(longSeats / 2)
  const back = longSeats - front

  const chairs: ChairPlacement[] = []
  for (const [count, nz] of [[front, 1], [back, -1]] as const) {
    for (const offset of spread(count, width)) {
      chairs.push({ x: offset, z: nz * (depth / 2 + CHAIR_SETBACK), rotationY: facing(0, nz) })
    }
  }
  if (ends === 2) {
    for (const nx of [1, -1]) {
      chairs.push({ x: nx * (width / 2 + CHAIR_SETBACK), z: 0, rotationY: facing(nx, 0) })
    }
  }
  return chairs
}

function roundChairs(seats: number, { width }: TableDimensions): ChairPlacement[] {
  const radius = width / 2 + CHAIR_SETBACK
  return Array.from({ length: seats }, (_, i) => {
    const angle = (i / seats) * Math.PI * 2
    const nx = Math.sin(angle)
    const nz = Math.cos(angle)
    return { x: nx * radius, z: nz * radius, rotationY: facing(nx, nz) }
  })
}

/** Chairs in the table's local space; always exactly `table.seats` of them. */
export function getChairPlacements(table: Pick<RestaurantTableConfig, 'shape' | 'seats'>): ChairPlacement[] {
  const dimensions = getTableDimensions(table.shape, table.seats)
  if (table.shape === 'round') return roundChairs(table.seats, dimensions)
  if (table.shape === 'square') return squareChairs(table.seats, dimensions)
  return rectangularChairs(table.seats, dimensions)
}

/**
 * Seated guests (table-local space) from explicit assignments. Assignments
 * with a seat index the table doesn't have, or a seat already taken, are
 * skipped here (validation reports them) so a bad payload can't crash the scene.
 */
export function getGuestPlacements(
  table: Pick<RestaurantTableConfig, 'shape' | 'seats'>,
  guests: RestaurantGuestAssignment[],
): RestaurantGuestPlacement[] {
  const chairs = getChairPlacements(table)
  const taken = new Set<number>()
  const placements: RestaurantGuestPlacement[] = []
  for (const guest of guests) {
    const chair = chairs[guest.seatIndex]
    if (!chair || taken.has(guest.seatIndex)) continue
    taken.add(guest.seatIndex)
    placements.push({ id: guest.id, seatIndex: guest.seatIndex, x: chair.x, z: chair.z, rotationY: chair.rotationY })
  }
  return placements
}
