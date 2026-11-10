/**
 * Layout contract for the 3D restaurant floor (isolated lab).
 *
 * Coordinates are in metres on the floor plane: `x` runs left/right, `z`
 * runs towards/away from the default camera, and `y` (up) is implicit — every
 * table rests on the floor. Rotation is a rotation around the vertical axis,
 * in degrees, so a layout stays readable and editable by hand.
 */

export type RestaurantTableShape = 'round' | 'square' | 'rectangular'

/**
 * Any positive whole number of seats. Common capacities are 2/4/6/8 but the
 * geometry is derived from this number, so 10 or 12 work without new code.
 */
export type RestaurantTableSeats = number

export interface FloorPosition {
  x: number
  z: number
}

export interface RestaurantTableConfig {
  id: string
  /** Explicit link to the restaurant's numeric API table ID; absent means unmapped. */
  backendTableId?: number | null
  /** Number shown to staff (distinct from the technical id). */
  number: number
  seats: RestaurantTableSeats
  shape: RestaurantTableShape
  position: FloorPosition
  /** Rotation around the vertical axis, in degrees. */
  rotation: number
}

export interface RestaurantLayout {
  tables: RestaurantTableConfig[]
  /** Optional configured walk-in point in the same floor coordinates. */
  entrance?: FloorPosition | null
}

/** Floor size (metres) and editor grid step, as persisted with a layout. */
export interface RestaurantFloorSpec {
  width: number
  depth: number
  gridStep: number
}

/**
 * Persisted form of a layout (Layout V1) — exactly what the backend stores
 * and returns at `/restaurants/{id}/floor-layout`. Configuration only: no
 * guests, orders, events or any other operational state.
 * Table `id` is a UUID minted by the editor when the table is created and is
 * the table's stable identity; `number` is editable business data.
 */
export interface RestaurantLayoutDocument {
  version: 1
  floor: RestaurantFloorSpec
  entrance?: FloorPosition | null
  tables: RestaurantTableConfig[]
}
