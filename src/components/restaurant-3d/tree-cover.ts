import { TREE_SHAPE, toWorld, type UrbanPlan } from './urban-plan'

/**
 * Visual cover (Phase 3.1K-D2B): does a street tree actually hide a standing guest from a given camera? Answered with
 * real ray tests against the SAME shapes `UrbanExterior` draws (trunk cylinder, crown and lobe ellipsoids, shrub bed),
 * never "the tree is nearby, so it hides". Pure maths, no three.js: usable by the planner, the tests and the live
 * camera check alike.
 */
export interface Eye {
  x: number
  y: number
  z: number
}
export type Occluder =
  | { kind: 'ellipsoid'; x: number; y: number; z: number; rx: number; ry: number; rz: number }
  | { kind: 'cylinder'; x: number; z: number; r: number; y0: number; y1: number }

/** Standing guest, sampled head to toe (m) and across the shoulders (m, perpendicular to the view). */
export const BODY_HEIGHTS = [0.08, 0.5, 0.95, 1.35, 1.68] as const
export const BODY_HALF_WIDTH = 0.2

/**
 * World occluders of one tree whose base is at world (x, z). `lobe` is the world offset (m, at scale 1) of the small
 * second crown lobe, which the renderer places along the wall and slightly towards the building.
 */
export function treeShapes(x: number, z: number, scale: number, lobe: { x: number; z: number }): Occluder[] {
  const T = TREE_SHAPE
  const s = scale
  // The drawn crowns are low-poly icospheres, a hair inside the ideal sphere: shrink the test shapes so cover is never overclaimed.
  const k = 0.94
  return [
    { kind: 'cylinder', x, z, r: T.trunk.r * s, y0: 0, y1: T.trunk.h * s },
    { kind: 'ellipsoid', x, y: T.crown.y * s, z, rx: T.crown.r * s * k, ry: T.crown.r * s * k, rz: T.crown.r * s * k },
    { kind: 'ellipsoid', x: x + lobe.x * s, y: (T.crown.y + T.lobe.dy) * s, z: z + lobe.z * s, rx: T.lobe.r * s * k, ry: T.lobe.r * s * k, rz: T.lobe.r * s * k },
    { kind: 'ellipsoid', x, y: T.bed.y * s, z, rx: T.bed.rx * s * k, ry: T.bed.ry * s * k, rz: T.bed.rx * s * k },
  ]
}

/** Occluders of the plan's street trees, exactly where `UrbanExterior` draws them (lobe: +dx along the wall, dz out). */
export function planOccluders(plan: UrbanPlan): Occluder[] {
  const out: Occluder[] = []
  for (const t of plan.trees) {
    const base = toWorld(plan.side, t.a, t.d)
    const lobe = toWorld(plan.side, t.a + TREE_SHAPE.lobe.dx, t.d + TREE_SHAPE.lobe.dz)
    out.push(...treeShapes(base.x, base.z, t.scale, { x: lobe.x - base.x, z: lobe.z - base.z }))
  }
  return out
}

/** Segment (p -> q) against one occluder. */
function blocks(o: Occluder, px: number, py: number, pz: number, qx: number, qy: number, qz: number): boolean {
  const dx = qx - px
  const dy = qy - py
  const dz = qz - pz
  if (o.kind === 'ellipsoid') {
    const ox = (px - o.x) / o.rx
    const oy = (py - o.y) / o.ry
    const oz = (pz - o.z) / o.rz
    const ex = dx / o.rx
    const ey = dy / o.ry
    const ez = dz / o.rz
    const a = ex * ex + ey * ey + ez * ez
    const b = 2 * (ox * ex + oy * ey + oz * ez)
    const c = ox * ox + oy * oy + oz * oz - 1
    const disc = b * b - 4 * a * c
    if (disc < 0 || a === 0) return false
    const root = Math.sqrt(disc)
    const t0 = (-b - root) / (2 * a)
    const t1 = (-b + root) / (2 * a)
    return t1 >= 0 && t0 <= 1
  }
  const ox = px - o.x
  const oz = pz - o.z
  const a = dx * dx + dz * dz
  let t0 = 0
  let t1 = 1
  if (a < 1e-12) {
    if (ox * ox + oz * oz > o.r * o.r) return false
  } else {
    const b = 2 * (ox * dx + oz * dz)
    const c = ox * ox + oz * oz - o.r * o.r
    const disc = b * b - 4 * a * c
    if (disc < 0) return false
    const root = Math.sqrt(disc)
    t0 = Math.max(0, (-b - root) / (2 * a))
    t1 = Math.min(1, (-b + root) / (2 * a))
    if (t0 > t1) return false
  }
  const y0 = py + dy * t0
  const y1 = py + dy * t1
  return Math.max(y0, y1) >= o.y0 && Math.min(y0, y1) <= o.y1
}

/**
 * Fraction (0..1) of a standing body at ground point `p` that is hidden from `eye` by `occluders`: five heights times
 * three points across the shoulders (perpendicular to the view direction). 1 = nothing of the guest can be seen.
 */
export function hiddenFraction(eye: Eye, p: { x: number; z: number }, occluders: readonly Occluder[]): number {
  const vx = p.x - eye.x
  const vz = p.z - eye.z
  const len = Math.hypot(vx, vz) || 1
  const sx = -vz / len
  const sz = vx / len
  // Only shapes near the guest can sit between it and the eye.
  const near = occluders.filter(o => Math.hypot(o.x - p.x, o.z - p.z) < 6)
  if (!near.length) return 0
  let hidden = 0
  let total = 0
  for (const h of BODY_HEIGHTS) {
    for (const w of [-BODY_HALF_WIDTH, 0, BODY_HALF_WIDTH]) {
      total++
      const x = p.x + sx * w
      const z = p.z + sz * w
      if (near.some(o => blocks(o, eye.x, eye.y, eye.z, x, h, z))) hidden++
    }
  }
  return hidden / total
}
