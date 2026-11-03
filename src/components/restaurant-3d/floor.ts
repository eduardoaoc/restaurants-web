/**
 * The one source for the floor's size and the editor's grid. The scene's floor
 * plane, its shadow frustum and the editor's bounds all read from here.
 * The floor is centred on the origin: x ∈ [-width/2, width/2], z likewise.
 */
export const FLOOR = { width: 20, depth: 16 } as const

/** Position snapping step (m) used by the layout editor. */
export const GRID_STEP = 0.25

/** Rotation step (degrees) of the editor's rotate buttons. */
export const ROTATION_STEP = 15

/** Room kept between a tabletop's edge and the floor edge, for the chairs. */
export const FLOOR_EDGE_MARGIN = 0.5
