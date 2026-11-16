/**
 * Camera range of the Ultimate demo with its urban exterior (Phase 3.1K-D2B). The world is deliberately finite (a 300 m
 * road, ground and sidewalks), so the camera must never be able to show its edge as an island: the range is derived from
 * the VIEWPORT (the overview fit for the actual canvas size), not from a fixed number, and the world fades into the
 * background colour with fog before its far end. `tests/frontend-camera-limits.mjs` samples the whole permitted camera
 * range on real viewport sizes and checks that no world end is ever in view.
 */
export const WORLD_FOG = { near: 88, far: 128 } as const
/** Lowest the camera may orbit: 18 degrees above the ground (a side view stays a side view, never the horizon). */
export const MIN_ELEVATION_DEG = 18
export const MAX_POLAR = ((90 - MIN_ELEVATION_DEG) * Math.PI) / 180
/**
 * Orbit azimuth (rad, three.js convention: 0 = looking from +z/south, +pi/2 = from +x/east): the camera stays on the open
 * side of the static cutaway, from just past due south (-10 deg) to just past due east (100 deg). The full-height back
 * (north) and left (west) walls would otherwise stand between the camera and the room. The default view is at ~33 deg.
 */
export const MIN_AZIMUTH = (-10 * Math.PI) / 180
export const MAX_AZIMUTH = (100 * Math.PI) / 180
/** A hair off the pole so the orbit never flips (near top-down is allowed). */
export const MIN_POLAR = 0.12
/** Closest the camera may get to its target (m): a table / guest close-up, never inside a wall. */
export const MIN_DISTANCE = 6
/** Farthest the camera may ever be from its target (m), whatever the screen. */
export const HARD_MAX_DISTANCE = 80
/** How far past the full-overview fit the person may zoom out (a little air around the street, no more). */
export const OVERVIEW_SLACK = 1.12
/**
 * Where the orbit target (what the camera looks at and pans around) may be: the restaurant, its terrace and the near
 * sidewalk, never off into the world.
 */
export const TARGET_BOUNDS = { minX: -14, maxX: 14, minZ: -12, maxZ: 12, minY: 0, maxY: 1.6 } as const

export interface CameraLimits {
  minDistance: number
  maxDistance: number
  minPolar: number
  maxPolar: number
  minAzimuth: number
  maxAzimuth: number
  target: typeof TARGET_BOUNDS
}

/**
 * @param overviewDistance Distance at which the whole restaurant, terrace and street context fit THIS canvas (the
 * "Vista general" fit). A tall phone needs far more than a desktop, so the allowed zoom-out follows the screen.
 */
export function cameraLimits(overviewDistance: number): CameraLimits {
  const fit = Number.isFinite(overviewDistance) && overviewDistance > 0 ? overviewDistance : 40
  const maxDistance = Math.min(HARD_MAX_DISTANCE, Math.max(MIN_DISTANCE * 3, Math.round(fit * OVERVIEW_SLACK)))
  return { minDistance: MIN_DISTANCE, maxDistance, minPolar: MIN_POLAR, maxPolar: MAX_POLAR, minAzimuth: MIN_AZIMUTH, maxAzimuth: MAX_AZIMUTH, target: TARGET_BOUNDS }
}

/** Clamps an orbit target into the bounds; returns the correction applied (what the camera must be shifted by). */
export function clampTarget(target: { x: number; y: number; z: number }, bounds = TARGET_BOUNDS): { dx: number; dy: number; dz: number } {
  const x = Math.min(bounds.maxX, Math.max(bounds.minX, target.x))
  const y = Math.min(bounds.maxY, Math.max(bounds.minY, target.y))
  const z = Math.min(bounds.maxZ, Math.max(bounds.minZ, target.z))
  return { dx: x - target.x, dy: y - target.y, dz: z - target.z }
}
