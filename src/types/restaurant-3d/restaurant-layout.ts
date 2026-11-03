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
}

/** Serialisable form of a layout (what a future save/load would exchange). */
export interface RestaurantLayoutDocument {
  version: 1
  tables: RestaurantTableConfig[]
}
