import type { FloorPosition, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { contentCenter, fitDistance, type FramingPoint, type ScreenInsets, type Vec3 } from './camera-fit'
import { FLOOR } from './floor'
import { COMPACT_VIEWPORT_PX, overlayMetrics, tableFramingPoints } from './overlay-metrics'

export const CAMERA_FOV = 35
/** Height of the orbit target above the floor (m). */
export const TARGET_HEIGHT = 0.4
const MIN_DISTANCE = 11
const MAX_DISTANCE = 40

/** Three-quarter view from the south-east; slightly more front-facing on narrow screens. */
export function viewDirection(viewportWidth: number): Vec3 {
  const raw: Vec3 = [viewportWidth <= COMPACT_VIEWPORT_PX ? 4.5 : 8, 12, 12.5]
  const length = Math.hypot(...raw)
  return [raw[0] / length, raw[1] / length, raw[2] / length]
}

/**
 * Default view of the Ultimate demo. Desktop/tablet: the isometric three-quarter view (45 degrees, from the south-east).
 * Phone portrait (<= 640 px): the camera swings to 85 degrees (looking west across the terrace) and sits at 44 degrees up, so
 * the room's long axis (room + terrace, 28 m) runs up the tall screen and its short one (16 m) across the narrow one: the
 * room, both walls kinds and the terrace fit at ~17 px/m instead of ~11 px/m. Inside the camera's azimuth limits.
 */
export const ULTIMATE_ISO: Vec3 = [0.57, 0.6, 0.57]
const PHONE_AZIMUTH = (85 * Math.PI) / 180
const PHONE_ELEVATION = (44 * Math.PI) / 180
export function ultimateDirection(viewportWidth: number): Vec3 {
  if (viewportWidth > COMPACT_VIEWPORT_PX) return ULTIMATE_ISO
  return [Math.sin(PHONE_AZIMUTH) * Math.cos(PHONE_ELEVATION), Math.sin(PHONE_ELEVATION), Math.cos(PHONE_AZIMUTH) * Math.cos(PHONE_ELEVATION)]
}

export interface FrameInput {
  tables: readonly RestaurantTableConfig[]
  entrance?: FloorPosition | null
  /** Layout editing: the whole floor must be reachable, not only where tables are today. */
  includeFloor?: boolean
  /** Canvas size in px. */
  width: number
  height: number
  /** Window width: picks the compact or regular overlay sizes. */
  viewportWidth: number
  insets?: ScreenInsets
  /** Overrides the default three-quarter view direction (unit vector). */
  direction?: Vec3
  /** Frame the top of the walls too (corner points at this height, m). */
  wallHeight?: number
  /** Closest the camera may be fitted (m); a small cluster of tables can be framed nearer than the default. */
  minDistance?: number
  /** Farthest the camera may be fitted (m); the demo room needs more than the table-only framing on a phone. */
  maxDistance?: number
  /** Ground points (y = 0) around the room that must stay in view too (street, sidewalk, terrace); only with `includeFloor`. */
  context?: ReadonlyArray<{ x: number; z: number }>
}

export interface Frame {
  target: Vec3
  direction: Vec3
  distance: number
  position: Vec3
}

/**
 * Camera pose for the restaurant as it is laid out: the content's centre as orbit target and the nearest distance at
 * which every table footprint, label and operational pill (with its real on-screen size) stays inside the canvas and
 * its safe-area insets.
 */
export function frameRestaurant(input: FrameInput): Frame {
  const metrics = overlayMetrics(input.viewportWidth)
  const points: FramingPoint[] = input.tables.flatMap(table => tableFramingPoints(table, metrics))
  if (input.entrance) points.push({ x: input.entrance.x, y: 0, z: input.entrance.z, padX: metrics.edge, padTop: metrics.edge, padBottom: metrics.edge })
  if (input.includeFloor || !points.length) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      points.push({ x: (sx * FLOOR.width) / 2, y: 0, z: (sz * FLOOR.depth) / 2, padX: metrics.edge, padTop: metrics.edge, padBottom: metrics.edge })
    }
  }
  if (input.includeFloor) for (const p of input.context ?? []) points.push({ x: p.x, y: 0, z: p.z, padX: metrics.edge, padTop: metrics.edge, padBottom: metrics.edge })
  if (input.includeFloor && input.wallHeight) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      points.push({ x: (sx * FLOOR.width) / 2, y: input.wallHeight, z: (sz * FLOOR.depth) / 2, padX: metrics.edge, padTop: metrics.edge, padBottom: metrics.edge })
    }
  }
  const center = contentCenter(points, { x: 0.8, z: 0 })
  const target: Vec3 = [center.x, TARGET_HEIGHT, center.z]
  const direction = input.direction ?? viewDirection(input.viewportWidth)
  const distance = fitDistance({
    points, target, direction, fov: CAMERA_FOV, width: input.width, height: input.height, insets: input.insets,
    minDistance: input.minDistance ?? MIN_DISTANCE, maxDistance: input.maxDistance ?? MAX_DISTANCE,
  })
  return { target, direction, distance, position: [target[0] + direction[0] * distance, target[1] + direction[1] * distance, target[2] + direction[2] * distance] }
}
