import { NavGrid, type NavObstacle, type Pt } from './floor-nav'
import { DOOR_OPENING, OUTDOOR_GRID, SIDEWALK_DEPTH, WALL_T, toLocal, toWorld, type UrbanPlan } from '../urban-plan'
import { hiddenFraction, planOccluders, type Eye, type Occluder } from '../tree-cover'

/**
 * Outdoor leg of a guest's route (Phase 3.1K-D2A): sidewalk spawn -> door line -> through the door opening -> the
 * configured entrance, and the same way back to a sidewalk exit point. The sidewalk part is a REAL `NavGrid` A* over the
 * urban obstacles (building, road, trees, planters, lamps, neighbours, terrace deck): pedestrians can never cross the
 * road or a wall, and a blocked lane is reported, never walked through. The indoor part is untouched: the existing
 * `planArrival` / `planDeparture` start and end at the entrance, and these legs are joined to them.
 */
const OUTDOOR_FLOOR = OUTDOOR_GRID
const OUTDOOR_OPTIONS = { cell: 0.25, clearance: 0.3, margin: 0.4 } as const
/** Body radius used for the door passage (matches the indoor planner). */
const BODY = 0.17
/** How far inside the floor edge the door passage ends before the route continues to the entrance (m). */
const INSIDE_STEP = 0.45

/** A sidewalk spot where a guest is completely hidden behind a tree from the reference camera. */
export interface CoverPoint extends Pt {
  /** Index into `plan.trees`. */
  tree: number
}

export interface OutdoorNav {
  plan: UrbanPlan
  grid: NavGrid
  /** Hidden spawn / despawn spots behind trees (empty when no tree gives full cover from `eye`, or no `eye` is known). */
  covers: CoverPoint[]
  occluders: Occluder[]
  eye: Eye | null
}

/** Rings (m from the trunk) and the angular step searched for a hidden spot behind each tree. */
const COVER_RADII = [0.95, 1.1, 1.3, 1.55, 1.85] as const
const COVER_STEPS = 24
/** A hidden spot keeps this far from the door line, so the guest is seen walking a stretch of sidewalk (m). */
const COVER_MIN_DOOR_DISTANCE = 4.5
/** Guests pick among this many nearest tree spots (by distance to the door). */
const NEAREST_COVERS = 4

/**
 * For each street tree, the nearest sidewalk point (free in the outdoor grid, off the door line) from which NO part of a
 * standing guest is visible from `eye`: real ray tests against the drawn tree shapes (`tree-cover.ts`). A tree with no
 * such point (e.g. the camera sees it edge-on, or the spot would be in the road) simply offers none.
 */
export function findCoverPoints(plan: UrbanPlan, grid: NavGrid, occluders: readonly Occluder[], eye: Eye): CoverPoint[] {
  const out: CoverPoint[] = []
  plan.trees.forEach((tree, index) => {
    const base = toWorld(plan.side, tree.a, tree.d)
    if (Math.abs(base.x) > OUTDOOR_GRID.width / 2 - 2 || Math.abs(base.z) > OUTDOOR_GRID.depth / 2 - 2) return
    let best: { p: Pt; score: number } | null = null
    for (const r of COVER_RADII) {
      for (let k = 0; k < COVER_STEPS; k++) {
        const angle = (k / COVER_STEPS) * Math.PI * 2
        const p = { x: base.x + Math.cos(angle) * r, z: base.z + Math.sin(angle) * r }
        const local = toLocal(plan.side, p.x, p.z)
        if (local.d < 0.6 || local.d > SIDEWALK_DEPTH - 0.5 || Math.abs(local.a - plan.doorA) < COVER_MIN_DOOR_DISTANCE) continue
        if (!grid.pointFree(p.x, p.z)) continue
        if (hiddenFraction(eye, p, occluders) < 1) continue
        // Nearest ring first; among equals the spot nearest the walking side (towards the door line).
        const score = r * 10 + Math.abs(local.d - 1.4) * 0.1
        if (!best || score < best.score) best = { p, score }
      }
      if (best) break
    }
    if (best) out.push({ ...best.p, tree: index })
  })
  return out
}

export function buildOutdoorNav(plan: UrbanPlan, eye: Eye | null = null): OutdoorNav {
  const obstacles: NavObstacle[] = plan.obstacles.map((o): NavObstacle =>
    o.kind === 'circle'
      ? { kind: 'circle', x: o.x, z: o.z, r: o.r, tableId: `urban:${o.name}` }
      : { kind: 'rect', x: o.rect.x, z: o.rect.z, hx: o.rect.hx, hz: o.rect.hz, yaw: 0, tableId: `urban:${o.name}` },
  )
  const grid = new NavGrid(OUTDOOR_FLOOR, obstacles, OUTDOOR_OPTIONS)
  const occluders = planOccluders(plan)
  return { plan, grid, occluders, eye, covers: eye ? findCoverPoints(plan, grid, occluders, eye) : [] }
}

export type OutdoorFailure = 'door_blocked' | 'no_sidewalk_route'

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A place to appear at / vanish into: behind a tree (`hidden`) or, as a fallback, a lane point (needs a short fade). */
export interface Spot {
  p: Pt
  hidden: boolean
}

/**
 * Spots in the order this guest prefers them (deterministic per guest): the hidden tree spots first, then the lane.
 * `eye` (when given) re-checks cover from the CURRENT camera, so a tree that hides nobody from where the person has
 * orbited to is demoted to the fade fallback instead of being trusted.
 */
function spotOrder(nav: OutdoorNav, id: string, salt: number, eye: Eye | null = nav.eye): Spot[] {
  const rotate = <T,>(list: readonly T[]): T[] => {
    const start = list.length ? (hash(id) >>> salt) % list.length : 0
    return Array.from({ length: list.length }, (_, i) => list[(start + i) % list.length])
  }
  // The nearest few trees only: a guest should vanish after a short walk along the sidewalk, not after crossing the block.
  const front = nav.plan.front
  const nearest = [...nav.covers].sort((a, b) => Math.hypot(a.x - front.x, a.z - front.z) - Math.hypot(b.x - front.x, b.z - front.z)).slice(0, NEAREST_COVERS)
  const covers = rotate(nearest).map((c): Spot => ({ p: c, hidden: !eye || hiddenFraction(eye, c, nav.occluders) >= 1 }))
  const lane = rotate(nav.plan.lane).map((p): Spot => ({ p, hidden: false }))
  return [...covers.filter(c => c.hidden), ...covers.filter(c => !c.hidden), ...lane]
}

/**
 * Door passage from the sidewalk to the entrance: front point -> (door line, straight through the opening) -> entrance.
 * Every sample inside the wall's thickness must be within the opening, and the indoor end must be free floor.
 */
export function doorPassage(plan: UrbanPlan, entrance: Pt, indoorFree: (x: number, z: number) => boolean): Pt[] | null {
  const { side, doorA } = plan
  const inside = toWorld(side, doorA, -(WALL_T + INSIDE_STEP))
  const e = toLocal(side, entrance.x, entrance.z)
  const aligned = Math.abs(e.a - doorA) < 0.02
  // The entrance sits on the door line (aligned) -> one straight hop; otherwise pass the door first, then walk to it.
  const points: Pt[] = aligned ? [plan.front, entrance] : [plan.front, inside, entrance]
  if (!indoorFree(entrance.x, entrance.z) || (!aligned && !indoorFree(inside.x, inside.z))) return null
  const limit = DOOR_OPENING / 2 - BODY
  for (let i = 1; i < points.length; i++) {
    const a = toLocal(side, points[i - 1].x, points[i - 1].z)
    const b = toLocal(side, points[i].x, points[i].z)
    const steps = Math.max(1, Math.ceil(Math.hypot(b.a - a.a, b.d - a.d) / 0.05))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const d = a.d + (b.d - a.d) * t
      // Inside the wall thickness (d in [-WALL_T, 0]) the body must be within the doorway.
      if (d < 0.05 && d > -WALL_T - 0.05 && Math.abs(a.a + (b.a - a.a) * t - doorA) > limit) return null
    }
  }
  return points
}

const dedupe = (points: Pt[]): Pt[] => points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 1e-6)

/**
 * Arrival leg: a sidewalk spawn point -> A* along the sidewalk to the front of the door (arriving head-on, so the
 * doorway is crossed straight) -> through the door -> the entrance. Returns the points; the last one IS the entrance.
 */
export function planEntryLeg(
  nav: OutdoorNav,
  entrance: Pt,
  indoorFree: (x: number, z: number) => boolean,
  guestId: string,
  eye: Eye | null = nav.eye,
): { ok: true; points: Pt[]; spawn: Pt; hidden: boolean } | { ok: false; reason: OutdoorFailure } {
  const passage = doorPassage(nav.plan, entrance, indoorFree)
  if (!passage) return { ok: false, reason: 'door_blocked' }
  const inward = { x: -nav.plan.out[0], z: -nav.plan.out[1] }
  for (const { p: spawn, hidden } of spotOrder(nav, guestId, 3, eye)) {
    const walk = nav.grid.findPath(spawn, nav.plan.front, { endDir: inward })
    if (walk) return { ok: true, points: dedupe([...walk, ...passage.slice(1)]), spawn, hidden }
  }
  return { ok: false, reason: 'no_sidewalk_route' }
}

/**
 * Departure leg: from the entrance back out through the door -> sidewalk A* (leaving head-on, then turning) -> a lane
 * exit point. Starts AT the entrance (where the indoor departure plan ends) and ends on the sidewalk.
 */
export function planExitLeg(
  nav: OutdoorNav,
  entrance: Pt,
  indoorFree: (x: number, z: number) => boolean,
  guestId: string,
  eye: Eye | null = nav.eye,
): { ok: true; points: Pt[]; exit: Pt; hidden: boolean } | { ok: false; reason: OutdoorFailure } {
  const passage = doorPassage(nav.plan, entrance, indoorFree)
  if (!passage) return { ok: false, reason: 'door_blocked' }
  const outward = { x: nav.plan.out[0], z: nav.plan.out[1] }
  for (const { p: exit, hidden } of spotOrder(nav, guestId, 7, eye)) {
    const walk = nav.grid.findPath(nav.plan.front, exit, { startDir: outward })
    if (walk) return { ok: true, points: dedupe([...[...passage].reverse(), ...walk.slice(1)]), exit, hidden }
  }
  return { ok: false, reason: 'no_sidewalk_route' }
}

/**
 * Where a guest that is already outside the room is, relative to the door, for the "left while still arriving" case:
 * 'street' = on the sidewalk side of the wall, 'door' = inside the wall thickness / entrance margin, 'room' = indoors.
 */
export function whereIs(plan: UrbanPlan, p: Pt): 'street' | 'door' | 'room' {
  const { d } = toLocal(plan.side, p.x, p.z)
  if (d > 0.05) return 'street'
  if (d > -(WALL_T + INSIDE_STEP)) return 'door'
  return 'room'
}

/** Route back to the street for a guest caught in the doorway: out along the door line, then along the sidewalk. */
export function planRetreat(nav: OutdoorNav, from: Pt, guestId: string): Pt[] | null {
  const { plan } = nav
  const local = toLocal(plan.side, from.x, from.z)
  const lead: Pt[] = [from]
  const onLine = toWorld(plan.side, plan.doorA, local.d)
  if (Math.abs(local.a - plan.doorA) > 0.02) lead.push(onLine)
  lead.push(plan.front)
  const outward = { x: plan.out[0], z: plan.out[1] }
  for (const { p: exit } of spotOrder(nav, guestId, 7)) {
    const walk = nav.grid.findPath(plan.front, exit, { startDir: outward })
    if (walk) return dedupe([...lead, ...walk.slice(1)])
  }
  return null
}

/** Outdoor-only A* (guest already on the sidewalk): straight to an exit point. */
export function planSidewalkExit(nav: OutdoorNav, from: Pt, guestId: string): Pt[] | null {
  const start = nav.grid.nearestFree(from, 1.2)
  if (!start) return null
  for (const { p: exit } of spotOrder(nav, guestId, 7)) {
    const walk = nav.grid.findPath(start, exit)
    if (walk) return walk
  }
  return null
}
