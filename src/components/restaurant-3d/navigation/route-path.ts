import { BEHIND_Z, CHAIR_PULL, PIVOT_RADIUS, SIDE_X } from '../characters/chair-interaction'
import type { NavGrid, NavObstacle, Pt } from './floor-nav'

/**
 * A walkable route (polyline sampled by arc length) plus the planners that build arrival and
 * departure routes for one seat. Pure and deterministic, so it is unit-testable and the same
 * route can drive both the actor and the dev overlay (what you see drawn is what is walked).
 */
export interface RouteSample {
  x: number
  z: number
  /** Heading (rad) of the segment under the sample; forward = (sin yaw, cos yaw). */
  yaw: number
  /** 0..1 walking-speed factor (slow while pivoting). */
  speed: number
}

export interface RouteMarkers {
  /** Arrival: distance at which the customer reaches the approach point and starts pulling the chair out. */
  pullAt?: number
  /** Departure: distance at which the customer is clear of the chair lane and the chair may return. */
  returnAt?: number
}

export class RoutePath {
  readonly length: number
  private readonly cum: number[] = [0]

  readonly points: readonly Pt[]
  private readonly speeds: readonly number[]
  /** Distances along the route at which the chair interaction reacts (see the planners). */
  readonly markers: RouteMarkers

  constructor(points: readonly Pt[], speeds: readonly number[] = [], markers: RouteMarkers = {}) {
    this.points = points
    this.speeds = speeds
    this.markers = markers
    let total = 0
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
      this.cum.push(total)
    }
    this.length = total
  }

  sample(distance: number, out: RouteSample): RouteSample {
    const n = this.points.length
    if (n < 2) {
      // Degenerate route (e.g. a customer that has only just appeared at the exit): a single point, nothing to walk.
      out.x = this.points[0]?.x ?? 0
      out.z = this.points[0]?.z ?? 0
      out.speed = 1
      return out
    }
    const d = Math.min(Math.max(distance, 0), this.length)
    let i = 1
    while (i < n - 1 && this.cum[i] < d) i++
    const a = this.points[i - 1]
    const b = this.points[i]
    const span = this.cum[i] - this.cum[i - 1] || 1
    const t = (d - this.cum[i - 1]) / span
    out.x = a.x + (b.x - a.x) * t
    out.z = a.z + (b.z - a.z) * t
    out.yaw = Math.atan2(b.x - a.x, b.z - a.z)
    out.speed = this.speeds[i] ?? 1
    return out
  }

  /** Index of the first point at or beyond `distance` (for trimming the drawn line as it is walked). */
  indexAt(distance: number): number {
    let i = 0
    while (i < this.points.length - 1 && this.cum[i + 1] <= distance) i++
    return i
  }
}

export interface SeatFrame {
  /** Chair centre on the floor (world). */
  x: number
  z: number
  /** Which chair this is (lets the planner ignore it, it is being pulled out of the way). */
  ref?: { tableId: string; chairIndex: number }
  /** Yaw of the chair: forward (toward the table) = (sin yaw, cos yaw). */
  yaw: number
}

/** World point at chair-local (lx, lz): +Z toward the table, +X to the chair's local right. */
export function chairPoint(seat: SeatFrame, lx: number, lz: number): Pt {
  const s = Math.sin(seat.yaw)
  const c = Math.cos(seat.yaw)
  return { x: seat.x + lz * s + lx * c, z: seat.z + lz * c - lx * s }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z)

function lengthOf(points: readonly Pt[]) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  return total
}

/** Rounds the interior corners of a polyline with quadratic Béziers and resamples it every ~0.1 m. */
export function smoothPolyline(points: readonly Pt[], radius: number): Pt[] {
  const out: Pt[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const l1 = dist(p0, p1)
    const l2 = dist(p1, p2)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    const a = { x: p1.x + ((p0.x - p1.x) / l1) * r, z: p1.z + ((p0.z - p1.z) / l1) * r }
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * r, z: p1.z + ((p2.z - p1.z) / l2) * r }
    for (let k = 0; k <= 10; k++) {
      const t = k / 10
      out.push({
        x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * p1.x + t * t * b.x,
        z: (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * p1.z + t * t * b.z,
      })
    }
  }
  out.push(points[points.length - 1])
  const dense: Pt[] = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]
    const b = out[i]
    const d = dist(a, b)
    if (d < 1e-6) continue
    const n = Math.max(1, Math.round(d / 0.1))
    for (let k = 1; k <= n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
  }
  return dense
}

const ARC_STEPS = 12
const FILLET = 0.3
const PIVOT_SPEED = 0.45

/** Chair-local -> world helpers for one seat. */
function frame(seat: SeatFrame) {
  const sin = Math.sin(seat.yaw)
  const cos = Math.cos(seat.yaw)
  return {
    L: (lx: number, lz: number): Pt => ({ x: seat.x + lz * sin + lx * cos, z: seat.z + lz * cos - lx * sin }),
    /** World point -> chair-local [x, z]. */
    local: (p: Pt): [number, number] => {
      const dx = p.x - seat.x
      const dz = p.z - seat.z
      return [dx * cos - dz * sin, dx * sin + dz * cos]
    },
  }
}

/**
 * Arrival, chair-local: A (beside the lane, behind the row) -> straight to the lateral line -> rounded corner ->
 * lateral run toward the lane mouth -> quarter pivot (radius PIVOT_RADIUS) ending AT the stand point E facing the table.
 * The customer is always beside the pulled-out chair (|x| >= SIDE_X - corner), never across it.
 */
function arrivalScript(seat: SeatFrame, standZ: number, s: 1 | -1): { points: Pt[]; speeds: number[] } {
  const { L } = frame(seat)
  const r = PIVOT_RADIUS
  const lead = smoothPolyline([L(s * SIDE_X, BEHIND_Z), L(s * SIDE_X, standZ - r), L(s * r, standZ - r)], FILLET)
  const arc: Pt[] = []
  for (let k = 1; k <= ARC_STEPS; k++) {
    const a = (k / ARC_STEPS) * (Math.PI / 2)
    arc.push(L(s * r - s * r * Math.sin(a), standZ - r * Math.cos(a)))
  }
  const points = [...lead, ...arc]
  return { points, speeds: points.map((_, i) => (i >= lead.length - 1 ? PIVOT_SPEED : 1)) }
}

/** Departure, chair-local: stand point E -> quarter pivot to the side -> lateral run -> rounded corner -> straight back to A. */
function departureScript(seat: SeatFrame, standZ: number, s: 1 | -1): { points: Pt[]; speeds: number[] } {
  const { L } = frame(seat)
  const r = PIVOT_RADIUS
  const arc: Pt[] = []
  for (let k = 0; k <= ARC_STEPS; k++) {
    const a = (k / ARC_STEPS) * (Math.PI / 2)
    arc.push(L(s * r - s * r * Math.cos(a), standZ + r * Math.sin(a)))
  }
  const tail = smoothPolyline([arc[arc.length - 1], L(s * SIDE_X, standZ + r), L(s * SIDE_X, BEHIND_Z)], FILLET)
  const points = [...arc, ...tail.slice(1)]
  return { points, speeds: points.map((_, i) => (i <= ARC_STEPS ? PIVOT_SPEED : 1)) }
}

const BODY = 0.17
/** Half-extent (m) of the chair seat, and how far the customer must stay from the PULLED-OUT chair. */
const CHAIR_HALF = 0.22
const CHAIR_KEEPOUT = 0.12

/**
 * A scripted side approach is accepted only if the whole walk keeps body clearance from every piece of furniture
 * EXCEPT the customer's own chair (pulled out of the way), the pulled-out chair's final footprint is free floor, and
 * the walk keeps clear of that pulled-out chair. Otherwise the seat is reported unreachable (no forced animation).
 */
function scriptClear(grid: NavGrid, seat: SeatFrame, standZ: number, pts: readonly Pt[]): boolean {
  const { L, local } = frame(seat)
  const ignore = seat.ref ? { tableId: seat.ref.tableId, chairIndex: seat.ref.chairIndex } : undefined
  for (const p of pts) {
    if (!grid.pointFreeFor(p.x, p.z, { clearance: BODY, ignore })) return false
    const [lx, lz] = local(p)
    // Distance from the pulled-out chair rectangle (chair-local: x +-0.22, z -CHAIR_PULL +-0.22).
    const dx = Math.max(Math.abs(lx) - CHAIR_HALF, 0)
    const dz = Math.max(Math.abs(lz + CHAIR_PULL) - CHAIR_HALF, 0)
    if (Math.hypot(dx, dz) < CHAIR_KEEPOUT) return false
  }
  // The pulled-out chair itself must land on free floor.
  for (const [cx, cz] of [[0, 0], [CHAIR_HALF, CHAIR_HALF], [-CHAIR_HALF, CHAIR_HALF], [CHAIR_HALF, -CHAIR_HALF], [-CHAIR_HALF, -CHAIR_HALF]]) {
    const q = L(cx, -CHAIR_PULL + cz)
    if (!grid.pointFreeFor(q.x, q.z, { clearance: 0.04, ignore })) return false
  }
  void standZ
  return true
}

export interface ArrivalPlan {
  route: RoutePath
  /** What the dev overlay draws: the whole walked route, entrance -> stand point. */
  overlay: Pt[]
  /** Where the customer reaches the chair zone (open floor beside/behind the row): the chair is pulled from here. */
  approach: Pt
  /** The stand point (feet) in front of the pulled-out chair, facing the table. */
  stand: Pt
  side: 1 | -1
}

export type PlanFailure = 'no_approach' | 'no_route'

/** Side order: the side the entrance is on first (shorter walk), then the other. */
function sideOrder(seat: SeatFrame, from: Pt): (1 | -1)[] {
  const [lx] = frame(seat).local(from)
  return lx >= 0 ? [1, -1] : [-1, 1]
}

/**
 * Entrance -> A* route to the approach point beside/behind the chair row -> scripted side approach around the
 * pulled-out chair -> pivot to face the table at the stand point. `standLocalZ` is chair-local and already accounts
 * for the pulled-out chair (GuestActor.standLocalZ).
 */
export function planArrival(
  grid: NavGrid,
  entrance: Pt,
  seat: SeatFrame,
  standLocalZ: number,
): { ok: true; plan: ArrivalPlan } | { ok: false; reason: PlanFailure } {
  const { L } = frame(seat)
  let reason: PlanFailure = 'no_approach'
  const candidates: { plan: ArrivalPlan; turn: number }[] = []
  for (const s of sideOrder(seat, entrance)) {
    const approach = L(s * SIDE_X, BEHIND_Z)
    if (!grid.pointFree(approach.x, approach.z)) continue
    const script = arrivalScript(seat, standLocalZ, s)
    if (!scriptClear(grid, seat, standLocalZ, script.points)) continue
    const nav = grid.findPath(entrance, approach, { endDir: { x: Math.sin(seat.yaw), z: Math.cos(seat.yaw) } })
    if (!nav) {
      reason = 'no_route'
      continue
    }
    const ignore = seat.ref ? { tableId: seat.ref.tableId, chairIndex: seat.ref.chairIndex } : undefined
    const joined = [...nav, ...script.points.slice(1)]
    const points = blendJunction(grid, joined, nav.length - 1, ignore)
    // Speeds follow the points: scripted pivot samples are the tail; everything before it walks at full speed.
    const pivotLength = script.points.length - (script.points.findIndex((_, i) => script.speeds[i] < 1))
    const speeds = points.map((_, i) => (i >= points.length - pivotLength ? PIVOT_SPEED : 1))
    // The chair is pulled where the (possibly blended) route comes closest to the approach point.
    let closest = 0
    for (let i = 1; i < points.length; i++) if (dist(points[i], approach) < dist(points[closest], approach)) closest = i
    candidates.push({
      turn: maxTurn(points),
      plan: {
        route: new RoutePath(points, speeds, { pullAt: lengthOf(points.slice(0, closest + 1)) }),
        overlay: points,
        approach,
        stand: points[points.length - 1],
        side: s,
      },
    })
  }
  if (!candidates.length) return { ok: false, reason }
  // Prefer the side with the gentler turns (then the shorter walk): no abrupt heading changes where A* meets the script.
  candidates.sort((a, b) => a.turn - b.turn || a.plan.route.length - b.plan.route.length)
  return { ok: true, plan: candidates[0].plan }
}

/**
 * Rounds the corner at `index` (where the A* route meets the scripted approach) with a Bézier over ~0.5 m each way.
 * Used only when the corner is sharp; kept as is if the blend would touch any furniture (own chair excepted).
 */
function blendJunction(grid: NavGrid, points: Pt[], index: number, ignore?: { tableId: string; chairIndex: number }): Pt[] {
  if (index <= 0 || index >= points.length - 1) return points
  const turn = maxTurn(points.slice(Math.max(0, index - 2), index + 3))
  if (turn < 0.6) return points
  let i0 = index
  let i1 = index
  for (let d = 0; i0 > 0 && d < 0.5; i0--) d += dist(points[i0], points[i0 - 1])
  for (let d = 0; i1 < points.length - 1 && d < 0.5; i1++) d += dist(points[i1], points[i1 + 1])
  const blended = smoothPolyline([points[i0], points[index], points[i1]], 0.45)
  if (!blended.every((q) => grid.pointFreeFor(q.x, q.z, { clearance: 0.2, ignore }))) return points
  return [...points.slice(0, i0), ...blended, ...points.slice(i1 + 1)]
}

/** Largest heading change (rad) between consecutive route segments. */
export function maxTurn(points: readonly Pt[]): number {
  let prev: number | null = null
  let worst = 0
  for (let i = 1; i < points.length; i++) {
    const h = Math.atan2(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
    if (prev !== null) worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(h - prev), Math.cos(h - prev))))
    prev = h
  }
  return worst
}

export interface DeparturePlan {
  route: RoutePath
  overlay: Pt[]
  approach: Pt
  stand: Pt
  side: 1 | -1
}

/**
 * Stand point -> pivot to the side -> lateral run -> straight back to the approach point -> A* route to the exit.
 * `markers.returnAt` is where the customer is clear of the chair lane (|x| beyond the chair), so the chair may return.
 */
export function planDeparture(
  grid: NavGrid,
  exit: Pt,
  seat: SeatFrame,
  standLocalZ: number,
): { ok: true; plan: DeparturePlan } | { ok: false; reason: PlanFailure } {
  const { L, local } = frame(seat)
  let reason: PlanFailure = 'no_approach'
  const candidates: { plan: DeparturePlan; turn: number }[] = []
  for (const s of sideOrder(seat, exit)) {
    const approach = L(s * SIDE_X, BEHIND_Z)
    if (!grid.pointFree(approach.x, approach.z)) continue
    const script = departureScript(seat, standLocalZ, s)
    if (!scriptClear(grid, seat, standLocalZ, script.points)) continue
    // The chair stays pulled out until the customer is clear: the walk-out must route around its footprint.
    const pulled = L(0, -CHAIR_PULL)
    const avoid: NavObstacle[] = [{ kind: 'rect', x: pulled.x, z: pulled.z, hx: CHAIR_HALF, hz: CHAIR_HALF, yaw: seat.yaw, tableId: 'pulled-chair' }]
    const nav = grid.findPath(approach, exit, { startDir: { x: -Math.sin(seat.yaw), z: -Math.cos(seat.yaw) }, avoid })
    if (!nav) {
      reason = 'no_route'
      continue
    }
    const ignore = seat.ref ? { tableId: seat.ref.tableId, chairIndex: seat.ref.chairIndex } : undefined
    const joined = [...script.points, ...nav.slice(1)]
    const points = blendJunction(grid, joined, script.points.length - 1, ignore)
    const speeds = points.map((_, i) => (i <= ARC_STEPS ? PIVOT_SPEED : 1))
    let returnAt = 0
    for (let i = 1; i < points.length; i++) {
      returnAt += dist(points[i - 1], points[i])
      if (Math.abs(local(points[i])[0]) >= CHAIR_HALF + 0.3 && i > ARC_STEPS) break
    }
    candidates.push({
      turn: maxTurn(points),
      plan: {
        route: new RoutePath(points, speeds, { returnAt }),
        // The dev path starts beside the chair (after the pivot), as before.
        overlay: points.slice(ARC_STEPS),
        approach,
        stand: points[0],
        side: s,
      },
    })
  }
  if (!candidates.length) return { ok: false, reason }
  candidates.sort((a, b) => a.turn - b.turn || a.plan.route.length - b.plan.route.length)
  return { ok: true, plan: candidates[0].plan }
}
