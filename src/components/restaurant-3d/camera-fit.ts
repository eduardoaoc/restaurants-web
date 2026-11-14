/**
 * How far back (relative to the desktop pose) the camera sits so the 20 x 16 m indoor floor stays readable in a scene of the
 * given aspect ratio. 1 on wide scenes; grows on narrow/portrait ones, capped so the floor never shrinks to a speck.
 */
export function cameraFit(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1
  return Math.min(2.1, Math.max(1, 1 + (1.6 - aspect) * 0.9))
}

// --- Content-based framing (Phase 3.1K-B2) --------------------------------------------------------------------------
// `cameraFit` above only knows the aspect ratio. The functions below fit the camera to the restaurant that is actually
// laid out (table footprints, label and badge anchors) and to the on-screen size of the overlays, so a badge hanging
// from the outermost table can never end up outside the canvas.

export type Vec3 = [number, number, number]

/**
 * A world point that must stay inside the canvas, plus the pixels of room it needs around its projection: an
 * operational pill is centred on its anchor, so the anchor needs half the pill's width on each side.
 */
export interface FramingPoint {
  x: number
  y: number
  z: number
  /** Screen-space room (px) left/right of the projected point. */
  padX: number
  /** Screen-space room (px) above the projected point. */
  padTop: number
  /** Screen-space room (px) below the projected point. */
  padBottom: number
}

/** Pixels of the canvas that may not be used (safe areas, overlays). */
export interface ScreenInsets {
  left: number
  right: number
  top: number
  bottom: number
}

export interface FramingInput {
  points: readonly FramingPoint[]
  /** Orbit target the camera looks at. */
  target: Vec3
  /** Unit-length direction from the target to the camera. */
  direction: Vec3
  /** Vertical field of view, degrees. */
  fov: number
  width: number
  height: number
  insets?: ScreenInsets
  /** Distance bounds (m) for the camera-to-target distance. */
  minDistance: number
  maxDistance: number
}

const NO_INSETS: ScreenInsets = { left: 0, right: 0, top: 0, bottom: 0 }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

/** Projects a world point to canvas pixels (origin top-left) for a camera at `target + direction * distance`. */
export function projectToCanvas(
  point: { x: number; y: number; z: number },
  input: Pick<FramingInput, 'target' | 'direction' | 'fov' | 'width' | 'height'>,
  distance: number,
): { x: number; y: number; depth: number } {
  const dir = normalize(input.direction)
  const forward: Vec3 = [-dir[0], -dir[1], -dir[2]]
  const right = normalize(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)
  const position: Vec3 = [input.target[0] + dir[0] * distance, input.target[1] + dir[1] * distance, input.target[2] + dir[2] * distance]
  const rel = sub([point.x, point.y, point.z], position)
  const depth = dot(rel, forward)
  const tanHalf = Math.tan((input.fov * Math.PI) / 360)
  const aspect = input.width / Math.max(1, input.height)
  const ndcX = dot(rel, right) / (depth * tanHalf * aspect)
  const ndcY = dot(rel, up) / (depth * tanHalf)
  return { x: (input.width / 2) * (1 + ndcX), y: (input.height / 2) * (1 - ndcY), depth }
}

/** True when every framing point (with its own padding and the insets) projects inside the canvas at `distance`. */
export function framingFits(input: FramingInput, distance: number): boolean {
  const insets = input.insets ?? NO_INSETS
  for (const point of input.points) {
    const p = projectToCanvas(point, input, distance)
    if (p.depth <= 0) return false
    if (p.x - point.padX < insets.left || p.x + point.padX > input.width - insets.right) return false
    if (p.y - point.padTop < insets.top || p.y + point.padBottom > input.height - insets.bottom) return false
  }
  return true
}

/**
 * Smallest camera-to-target distance (within the bounds) at which every point fits. Moving the camera back along its
 * viewing direction only ever pulls projections towards the centre, so the fit is monotonic and a bisection finds it.
 * When even `maxDistance` cannot fit (a canvas narrower than its own padding) it returns `maxDistance`.
 */
export function fitDistance(input: FramingInput): number {
  if (!input.points.length || !(input.width > 0) || !(input.height > 0)) return Math.min(input.maxDistance, Math.max(input.minDistance, 19))
  if (framingFits(input, input.minDistance)) return input.minDistance
  if (!framingFits(input, input.maxDistance)) return input.maxDistance
  let near = input.minDistance
  let far = input.maxDistance
  for (let i = 0; i < 28; i++) {
    const mid = (near + far) / 2
    if (framingFits(input, mid)) far = mid
    else near = mid
  }
  return far
}

/**
 * Centre of the content on the floor, used as the orbit target so an off-centre layout is framed symmetrically.
 * Padding is not part of this: only the world extent of the points.
 */
export function contentCenter(points: readonly { x: number; z: number }[], fallback: { x: number; z: number }): { x: number; z: number } {
  if (!points.length) return fallback
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
}
