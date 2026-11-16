import { FLOOR } from './floor'
import { entranceDoorway, type WallSide } from './environment-plan'

/**
 * Pure plan of the urban exterior around the Ultimate demo room (Phase 3.1K-D2A): the wall run with its door
 * openings, the street, sidewalk, vegetation, lamps, neighbours and the terrace. Nothing here is persisted and no
 * operational table ID is involved: it is derived from the room size and the CONFIGURED entrance only, so the street
 * always lies on the wall that has the entrance (never a hardcoded side).
 *
 * Two coordinate systems are used. WORLD is the scene's (x, z). Every exterior group is described in a wall-LOCAL
 * frame: `a` runs along the wall, `d` runs straight out from the wall's outer face. `sideFrame` converts both ways.
 */
export const WALL_T = 0.2
export const OUTER_X = FLOOR.width / 2 + WALL_T
export const OUTER_Z = FLOOR.depth / 2 + WALL_T
/** Width of the door opening of the converted door wall (the leaf is 0.9 m, the passage is the leaf). */
export const DOOR_OPENING = 0.9
/** One wall module (m). */
export const WALL_MODULE = 3
/** Corner post footprint: the wall runs stop this far (centre line) from the floor corner. */
const CORNER = 0.7

export interface SideFrame {
  /** Unit vector pointing away from the room. */
  n: readonly [number, number]
  /** Unit vector along the wall, in the direction of increasing local `a`. */
  t: readonly [number, number]
  /** Rotation about Y that maps a group's local +x to `t` and local +z to `n`. */
  theta: number
  /** Distance from the room centre to the wall's OUTER face. */
  face: number
  /** Half length of the wall's outer face along `t`. */
  half: number
}

export const SIDE_FRAMES: Readonly<Record<WallSide, SideFrame>> = {
  west: { n: [-1, 0], t: [0, 1], theta: -Math.PI / 2, face: OUTER_X, half: OUTER_Z },
  east: { n: [1, 0], t: [0, -1], theta: Math.PI / 2, face: OUTER_X, half: OUTER_Z },
  north: { n: [0, -1], t: [-1, 0], theta: Math.PI, face: OUTER_Z, half: OUTER_X },
  south: { n: [0, 1], t: [1, 0], theta: 0, face: OUTER_Z, half: OUTER_X },
}

export interface Pt {
  x: number
  z: number
}

/** Wall-local (a along the wall, d out from its outer face) -> world. */
export function toWorld(side: WallSide, a: number, d: number): Pt {
  const f = SIDE_FRAMES[side]
  return { x: f.n[0] * (f.face + d) + f.t[0] * a, z: f.n[1] * (f.face + d) + f.t[1] * a }
}

/** World -> wall-local. */
export function toLocal(side: WallSide, x: number, z: number): { a: number; d: number } {
  const f = SIDE_FRAMES[side]
  return { a: x * f.t[0] + z * f.t[1], d: x * f.n[0] + z * f.n[1] - f.face }
}

/** `along` of `entranceDoorway` (world z for east/west, world x for north/south) -> wall-local `a`. */
export function alongToLocal(side: WallSide, along: number): number {
  const f = SIDE_FRAMES[side]
  return along * (f.t[0] + f.t[1])
}

/** Axis-aligned world rectangle covering the wall-local box [a0, a1] x [d0, d1]. */
export interface WorldRect {
  x: number
  z: number
  hx: number
  hz: number
}
export function localRect(side: WallSide, a0: number, a1: number, d0: number, d1: number): WorldRect {
  const p = toWorld(side, a0, d0)
  const q = toWorld(side, a1, d1)
  return { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, hx: Math.abs(q.x - p.x) / 2, hz: Math.abs(q.z - p.z) / 2 }
}

// ---- wall run -------------------------------------------------------------------------------------------------------

export interface WallModulePlan {
  side: WallSide
  kind: 'wall' | 'door'
  /** Door modules only: the configured entrance (open doorway) as opposed to the closed terrace door. */
  entrance?: boolean
  /** Centre along the wall in WORLD terms (x for north/south, z for east/west): what `entranceDoorway` reports. */
  along: number
  /** Scale along the wall relative to the 3 m module. */
  stretch: number
  /** Whether the module carries one of the tall double-pane windows. */
  window: boolean
}

/** Half length of the wall run between the corner posts. */
export function runHalf(side: WallSide): number {
  const length = side === 'north' || side === 'south' ? FLOOR.width : FLOOR.depth
  return (length - CORNER + WALL_T) / 2
}

export interface DoorSpec {
  side: WallSide
  /** World `along` of the door centre. */
  along: number
  /** True for the configured entrance (an open doorway); false for the decorative, closed terrace door. */
  entrance: boolean
}

/** Terrace side: east, or west when the entrance already uses the east wall. */
export function terraceSide(entranceSide: WallSide | null): WallSide {
  return entranceSide === 'east' ? 'west' : 'east'
}
/** World z of the terrace centre line (the existing terrace reservation, z = 0.75). */
export const TERRACE_CENTER_Z = 0.75

/** Door openings of the room: the configured entrance and the (closed, decorative) terrace door. */
export function planDoors(entrance: Pt | null | undefined): DoorSpec[] {
  const entry = entranceDoorway(entrance)
  const tSide = terraceSide(entry?.side ?? null)
  const doors: DoorSpec[] = [{ side: tSide, along: TERRACE_CENTER_Z, entrance: false }]
  if (entry) {
    const half = runHalf(entry.side) - WALL_MODULE / 2
    doors.push({ side: entry.side, along: Math.min(half, Math.max(-half, entry.along)), entrance: true })
  }
  return doors
}

/**
 * Splits every wall run into modules. A door module is centred on its opening (so the doorway sits exactly on the
 * configured entrance); the stretches between are filled with the fewest whole modules, each stretched to fit.
 */
export function planWallModules(entrance: Pt | null | undefined): WallModulePlan[] {
  const doors = planDoors(entrance)
  const out: WallModulePlan[] = []
  for (const side of ['north', 'south', 'east', 'west'] as const) {
    const half = runHalf(side)
    const here = doors.filter(d => d.side === side).sort((a, b) => a.along - b.along)
    let cursor = -half
    const fill = (end: number): void => {
      const length = end - cursor
      if (length < 0.02) return
      const count = Math.max(1, Math.round(length / WALL_MODULE))
      const stretch = length / count / WALL_MODULE
      for (let i = 0; i < count; i++) {
        out.push({ side, kind: 'wall', along: cursor + (length / count) * (i + 0.5), stretch, window: i % 4 === 1 && stretch > 0.6 })
      }
      cursor = end
    }
    for (const door of here) {
      fill(door.along - WALL_MODULE / 2)
      out.push({ side, kind: 'door', entrance: door.entrance, along: door.along, stretch: 1, window: false })
      cursor = door.along + WALL_MODULE / 2
    }
    fill(half)
  }
  return out
}

// ---- static architectural cutaway (Phase 3.1K-E1) ---------------------------------------------------------------------

/**
 * The perimeter is a FIXED architectural cutaway, independent of the camera and of the entrance: the BACK wall (north,
 * z = -8) and the LEFT-hand wall (west, x = -10) keep their full height; the FRONT wall (south, towards the street and
 * the default camera) and the RIGHT-hand wall (east, the terrace side) are low walls. "Back / left / front / right" are
 * as seen from the default camera, which sits south-east of the room looking north-west: screen-right is +x / -z, so the
 * wall on the left of the screen is x = -10 and the one behind the room is z = -8 (verified on a render).
 */
export const FULL_WALL_SIDES: readonly WallSide[] = ['north', 'west']
export const LOW_WALL_SIDES: readonly WallSide[] = ['south', 'east']
/** Height of the full walls (the converted wall module) and of the low perimeter walls (m). */
export const WALL_HEIGHT = 3
export const LOW_WALL_HEIGHT = 0.4
export const isLowWall = (side: WallSide): boolean => LOW_WALL_SIDES.includes(side)

export interface WallPiece extends WallModulePlan {
  /** Low perimeter wall (0.4 m) instead of a full-height module. */
  low: boolean
}

/**
 * Wall modules as they are BUILT: full walls as planned (door modules keep their doorway); on the low walls a door module
 * becomes two low flanks with a real 0.9 m opening between them (the entrance, or the terrace passage), and windows are
 * dropped (a tall window cannot hang above a 0.4 m wall).
 */
export function planWallPieces(entrance: Pt | null | undefined): WallPiece[] {
  const out: WallPiece[] = []
  for (const m of planWallModules(entrance)) {
    if (!isLowWall(m.side)) {
      out.push({ ...m, low: false })
    } else if (m.kind === 'wall') {
      out.push({ ...m, window: false, low: true })
    } else {
      const flank = (m.stretch * WALL_MODULE - DOOR_OPENING) / 2
      for (const sign of [-1, 1]) {
        out.push({ side: m.side, kind: 'wall', along: m.along + sign * (DOOR_OPENING / 2 + flank / 2), stretch: flank / WALL_MODULE, window: false, low: true })
      }
    }
  }
  return out
}

export interface LowWallRun {
  side: WallSide
  /** World `along` extent of one continuous low wall (between corner piers / openings). */
  from: number
  to: number
}

/**
 * Continuous low-wall runs (E2): the low pieces of `planWallPieces` merged where they touch, so each run is ONE box with
 * no seams and the openings are exactly the gaps between runs.
 */
export function lowWallRuns(entrance: Pt | null | undefined): LowWallRun[] {
  const runs: LowWallRun[] = []
  for (const side of LOW_WALL_SIDES) {
    const spans = planWallPieces(entrance)
      .filter(p => p.side === side)
      .map(p => [p.along - (p.stretch * WALL_MODULE) / 2, p.along + (p.stretch * WALL_MODULE) / 2] as const)
      .sort((a, b) => a[0] - b[0])
    for (const [a, b] of spans) {
      const last = runs[runs.length - 1]
      if (last && last.side === side && Math.abs(last.to - a) < 1e-6) last.to = b
      else runs.push({ side, from: a, to: b })
    }
  }
  return runs
}

export interface WallPier {
  x: number
  z: number
  /** Footprint (m). */
  w: number
  d: number
  height: number
  low: boolean
}

/**
 * The four corner piers (E2): plain boxes filling the 0.45 m square between the ends of two wall runs and the outer corner.
 * Full height where a full wall ends or two full walls meet (NW, NE, SW), low only where both walls are low (SE).
 */
export function wallPiers(): WallPier[] {
  const hx = runHalf('south')
  const hz = runHalf('east')
  const out: WallPier[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const low = sx > 0 && sz > 0
      out.push({ x: (sx * (hx + OUTER_X)) / 2, z: (sz * (hz + OUTER_Z)) / 2, w: OUTER_X - hx, d: OUTER_Z - hz, height: low ? LOW_WALL_HEIGHT : WALL_HEIGHT, low })
    }
  }
  return out
}

// ---- urban layout ---------------------------------------------------------------------------------------------------

/** Sidewalk depth (m): 3.2 in D2A, wider now so trees, the door lane and a walking aisle coexist. */
export const SIDEWALK_DEPTH = 4.4
export const CURB_WIDTH = 0.2
/** Road width (m): two lanes plus parking margins (7 in D2A). */
export const ROAD_WIDTH = 8.4
/**
 * Half length of the road and of both sidewalks (m). Far longer than any permitted camera can see in full (fog hides
 * the last stretch), so no end is ever visible: see `camera-limits.ts`.
 */
export const ROAD_HALF_LENGTH = 150
/** Far (opposite) sidewalk depth (m). */
export const FAR_SIDEWALK_DEPTH = 3.4
/** Surface heights (m): pavement just under the room's base plane, road one curb lower. */
export const PAVEMENT_TOP = -0.012
export const APRON_TOP = -0.02
export const ROAD_TOP = -0.16
export const DECK_TOP = 0.08
/** Terrace deck: runs the whole wall (outer face) and reaches 8 m out (5 x 8 in D2A). */
export const DECK_DEPTH = 8
const PAVED_MARGIN = 5
/** Distance (m) of the terrace table rows from the wall. */
const TERRACE_ROWS = [1.9, 3.9, 5.9] as const
/** Half width (m) of the clear aisle in front of the terrace door. */
const TERRACE_AISLE = 1.5
const TABLE_PITCH = 2.1
const CHAIR_REACH = 0.62

export interface Placement {
  /** Wall-local position. */
  a: number
  d: number
}
export interface TreePlan extends Placement {
  scale: number
  tone: number
  /** Crown width factor (0.85-1.2). */
  w: number
  /** Which side the lobe leans to (+1 / -1 along the wall). */
  flip: 1 | -1
}
export interface BoxPlan extends Placement {
  w: number
  h: number
  depth: number
}

/**
 * Street tree geometry (m, at scale 1). ONE source for the renderer and the occlusion maths: what hides a guest is
 * exactly what is drawn. The crown is low and wide and a shrub bed fills the gap under it, so a person standing right
 * behind a tree is covered from head to feet from the default (elevated) camera.
 */
export const TREE_SHAPE = {
  trunk: { r: 0.14, h: 2.0 },
  /** Main crown: taller than wide (an oval, not a ball); `w` (per tree, 0.85-1.2) widens or slims it. */
  crown: { y: 2.3, rx: 0.82, ry: 1.2 },
  /** Lower side lobe (mirrored per tree by `flip`): breaks the silhouette. */
  lobe: { dx: 0.5, dy: -0.3, dz: -0.3, rx: 0.6, ry: 0.75 },
  /** Small top tuft (drawn only; it never counts as cover). */
  top: { dx: -0.15, dy: 0.95, dz: 0.1, r: 0.42 },
  bed: { y: 0.55, rx: 0.62, ry: 0.6 },
} as const
/** Nav footprint of a tree (the shrub bed). */
export const TREE_NAV_RADIUS = 0.62

export interface UrbanPlan {
  /** Side of the wall that has the street and the entrance. */
  side: WallSide
  /** False when no entrance is configured: the street is drawn but nothing arrives through it. */
  hasEntrance: boolean
  /** Wall-local `a` of the entrance door. */
  doorA: number
  doorAlong: number
  /** Outside centre of the doorway on the wall's outer face. */
  doorOutside: Pt
  /** A free point on the sidewalk straight out from the door: where outdoor routes meet the door line. */
  front: Pt
  /** Unit vector pointing away from the room at the entrance. */
  out: readonly [number, number]
  sidewalk: { a0: number; a1: number; depth: number }
  road: { a0: number; a1: number; d0: number; d1: number }
  /** Opposite sidewalk (scenery): curb at `road.d1`, walking surface from `d0`. */
  farSidewalk: { a0: number; a1: number; d0: number; depth: number }
  trees: TreePlan[]
  /** Scenery trees on the far sidewalk (no navigation role). */
  farTrees: TreePlan[]
  planters: BoxPlan[]
  lamps: Placement[]
  farLamps: Placement[]
  terrace: {
    side: WallSide
    /** Local centre of the terrace door along the wall. */
    a: number
    deck: { a0: number; a1: number; depth: number }
    tables: Placement[]
    plants: Placement[]
    hedges: BoxPlan[]
  }
  /** World margins of the paved apron around the room: [west, east, north, south]. */
  apron: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Everything outdoor pedestrians must walk around (world rectangles / circles), for the outdoor NavGrid. */
  obstacles: Array<{ kind: 'rect'; rect: WorldRect; name: string } | { kind: 'circle'; x: number; z: number; r: number; name: string }>
  /** Sidewalk spawn / exit candidates in order of preference (mid-lane, either side of the door). Fallback when no tree can hide a guest. */
  lane: Pt[]
  /** Reserved indoor rectangles beside the entrance (world). */
  reception: WorldRect
  corridor: WorldRect
}

/** Width (m) of the two planters flanking the door (the ones the lowpoly planter model replaces in the Ultimate fixture). */
export const DOOR_PLANTER_WIDTH = 1.1

/** Lane (mid-sidewalk) distance from the wall (m) where pedestrians walk. */
export const LANE_D = 1.4
/** Distance of the street trees from the building (m): mid-sidewalk, so a tree can hide a guest on either side of it. */
export const TREE_D = 2.7
/** Street trees stand within this distance (m) of the door line, either side. */
const TREE_WINDOW = 21
const LAMP_D = SIDEWALK_DEPTH - 0.3
/** Extent (m) of the walkable outdoor grid; obstacles outside it are scenery only. */
export const OUTDOOR_GRID = { width: 64, depth: 56 } as const

/** Deterministic pseudo-random in [0, 1): the same entrance always gives the same street. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Plan for a given entrance (the street goes where the entrance is). */
export function planUrban(entrance: Pt | null | undefined): UrbanPlan {
  const entry = entranceDoorway(entrance)
  // No configured entrance: the street still exists (south, facing the default camera) but has no door and no arrivals.
  const side: WallSide = entry?.side ?? 'south'
  const frame = SIDE_FRAMES[side]
  const half = runHalf(side)
  const doorAlong = entry ? Math.min(half - WALL_MODULE / 2, Math.max(-(half - WALL_MODULE / 2), entry.along)) : 0
  const doorA = alongToLocal(side, doorAlong)
  const tSide = terraceSide(side)
  const tFrame = SIDE_FRAMES[tSide]
  const tA = alongToLocal(tSide, TERRACE_CENTER_Z)

  const sidewalk = { a0: -ROAD_HALF_LENGTH, a1: ROAD_HALF_LENGTH, depth: SIDEWALK_DEPTH }
  const roadD0 = SIDEWALK_DEPTH + CURB_WIDTH
  const road = { a0: -ROAD_HALF_LENGTH, a1: ROAD_HALF_LENGTH, d0: roadD0, d1: roadD0 + ROAD_WIDTH }
  const farSidewalk = { a0: -ROAD_HALF_LENGTH, a1: ROAD_HALF_LENGTH, d0: road.d1 + CURB_WIDTH, depth: FAR_SIDEWALK_DEPTH }

  // Street trees: a handful (6-10) where they matter, around the door, with irregular spacing (5.5-7.5 m), a little lateral
  // jitter, varied size and crown width; never within 3.4 m of the door line.
  const mkTree = (a: number, d: number, i: number, size = 0.28): TreePlan => ({
    a, d, scale: 0.9 + rand(i + 80) * size, tone: Math.floor(rand(i + 120) * 3), w: 0.85 + rand(i + 160) * 0.35, flip: rand(i + 200) < 0.5 ? -1 : 1,
  })
  const trees: TreePlan[] = []
  let cursor = doorA - TREE_WINDOW
  for (let i = 0; cursor < doorA + TREE_WINDOW; i++) {
    const a = cursor
    cursor += 5.5 + rand(i + 1) * 2
    if (Math.abs(a - doorA) < 3.4) continue
    trees.push(mkTree(a, TREE_D + (rand(i + 40) - 0.5) * 0.5, i))
  }
  // Streetlights at the curb, ~15 m apart, never closer than 2.6 m to a tree or 3 m to the door.
  const lamps: Placement[] = []
  const lampAt = (a: number, d: number, into: Placement[], avoid: readonly Placement[], door = true): void => {
    // Nudge along the kerb to the nearest gap between trees (a pole never stands inside a crown).
    for (const nudge of [0, 2.2, -2.2, 4.4, -4.4]) {
      const x = a + nudge
      if (door && Math.abs(x - doorA) < 3) continue
      if (avoid.some(t => Math.abs(t.a - x) < 1.9)) continue
      into.push({ a: x, d })
      return
    }
  }
  for (let i = 0, a = sidewalk.a0 + 9; a < sidewalk.a1 - 6; i++, a += 13 + rand(i + 200) * 4) lampAt(a, LAMP_D, lamps, trees)

  // Planters against the building, flanking the doorway at >= 1.45 m from its centre (the corridor stays clear).
  const planters: BoxPlan[] = []
  for (const off of entry ? [-1.45, 1.45, -6.2, 6.2] : [-6.2, 6.2]) {
    const a = doorA + off
    if (Math.abs(a) < frame.half - 1.2) planters.push({ a, d: 0.32, w: off === -1.45 || off === 1.45 ? DOOR_PLANTER_WIDTH : 1.8, h: 0.55, depth: 0.5 })
  }

  // Far side (scenery): a few trees on the opposite pavement, only across from the restaurant.
  const farTrees: TreePlan[] = []
  const farD = farSidewalk.d0 + 1.7
  cursor = doorA - 24
  for (let i = 0; cursor < doorA + 24; i++) {
    farTrees.push(mkTree(cursor, farD + (rand(i + 300) - 0.5) * 0.5, i + 300, 0.32))
    cursor += 11 + rand(i + 420) * 4
  }
  const farLamps: Placement[] = []
  for (let i = 0, a = farSidewalk.a0 + 12; a < farSidewalk.a1 - 6; i++, a += 14 + rand(i + 500) * 4) lampAt(a, farSidewalk.d0 + 0.3, farLamps, farTrees, false)

  // Terrace: timber deck over the whole lateral wall, 8 m out. Tables in three rows either side of a clear aisle in front
  // of its door; chairs reach 0.62 m either side of a table along the wall, so a column stays that far from the hedges.
  const deck = { a0: -tFrame.half, a1: tFrame.half, depth: DECK_DEPTH }
  const reach = tFrame.half - CHAIR_REACH - 0.7
  const columns: number[] = []
  for (let off = TERRACE_AISLE + 0.9; tA + off <= reach; off += TABLE_PITCH) columns.push(tA + off)
  for (let off = TERRACE_AISLE + 0.9; tA - off >= -reach; off += TABLE_PITCH) columns.push(tA - off)
  columns.sort((x, y) => x - y)
  const tables: Placement[] = TERRACE_ROWS.flatMap(d => columns.map(a => ({ a, d })))
  const plants: Placement[] = [tA - TERRACE_AISLE, tA + TERRACE_AISLE, deck.a0 + 0.9, deck.a1 - 0.9].map(a => ({ a, d: 0.55 }))
  const hedges: BoxPlan[] = []
  const edgeD = DECK_DEPTH - 0.3
  const addEdge = (from: number, to: number): void => {
    const n = Math.max(1, Math.ceil((to - from) / 3))
    for (let i = 0; i < n; i++) hedges.push({ a: from + ((i + 0.5) * (to - from)) / n, d: edgeD, w: (to - from) / n - 0.1, h: 0.62, depth: 0.5 })
  }
  addEdge(deck.a0 + 0.55, tA - 1.2) // outer edge, with a 2.4 m gate opposite the door
  addEdge(tA + 1.2, deck.a1 - 0.55)
  for (const a of [deck.a0 + 0.25, deck.a1 - 0.25]) hedges.push({ a, d: DECK_DEPTH / 2, w: 0.5, h: 0.62, depth: DECK_DEPTH - 0.6 })

  // Paved apron around the room: the street sidewalk on the entrance side, the deck + a margin on the terrace side.
  const margin = (s: WallSide) => (s === side ? SIDEWALK_DEPTH : s === tSide ? DECK_DEPTH + 2 : PAVED_MARGIN)
  const apron = { minX: -OUTER_X - margin('west'), maxX: OUTER_X + margin('east'), minZ: -OUTER_Z - margin('north'), maxZ: OUTER_Z + margin('south') }

  // No trees behind or around the restaurant (MVP clean-up): the apron meets the ground directly.

  // Outdoor obstacles (world); scenery beyond the walkable grid is left out.
  const inGrid = (x: number, z: number) => Math.abs(x) < OUTDOOR_GRID.width / 2 - 0.5 && Math.abs(z) < OUTDOOR_GRID.depth / 2 - 0.5
  const obstacles: UrbanPlan['obstacles'] = [
    { kind: 'rect', rect: { x: 0, z: 0, hx: OUTER_X, hz: OUTER_Z }, name: 'building' },
    { kind: 'rect', rect: localRect(side, road.a0, road.a1, roadD0 - 0.02, road.d1 + CURB_WIDTH + FAR_SIDEWALK_DEPTH), name: 'road' },
    { kind: 'rect', rect: localRect(tSide, deck.a0, deck.a1, 0, DECK_DEPTH), name: 'terrace-deck' },
  ]
  for (const t of trees) {
    const p = toWorld(side, t.a, t.d)
    if (inGrid(p.x, p.z)) obstacles.push({ kind: 'circle', x: p.x, z: p.z, r: TREE_NAV_RADIUS, name: 'tree' })
  }
  for (const l of lamps) {
    const p = toWorld(side, l.a, l.d)
    if (inGrid(p.x, p.z)) obstacles.push({ kind: 'circle', x: p.x, z: p.z, r: 0.16, name: 'lamp' })
  }
  for (const p of planters) obstacles.push({ kind: 'rect', rect: localRect(side, p.a - p.w / 2, p.a + p.w / 2, p.d - p.depth / 2, p.d + p.depth / 2), name: 'planter' })

  // Walking lane: either side of the door, 6-10.5 m away (fallback spawn / exit when no tree can hide a guest).
  const lane: Pt[] = []
  for (const off of [7.5, -7.5, 9.5, -9.5, 6, -6, 10.5, -10.5]) lane.push(toWorld(side, doorA + off, LANE_D))

  const front = toWorld(side, doorA, LANE_D)
  const doorOutside = toWorld(side, doorA, 0)

  // Reserved space beside the entrance (inside): a clear 1.4 m corridor and a 2 m x 1.2 m reception-desk footprint on
  // the roomier side of the doorway. Both hug the wall; neither is built yet.
  const roomier = doorA > 0 ? -1 : 1
  const rA0 = doorA + roomier * 0.9
  const rA1 = doorA + roomier * 2.9
  const reception = localRect(side, Math.min(rA0, rA1), Math.max(rA0, rA1), -WALL_T - 1.2, -WALL_T)
  const corridor = localRect(side, doorA - 0.7, doorA + 0.7, -WALL_T - 2.6, -WALL_T)

  return {
    side, hasEntrance: !!entry, doorA, doorAlong, doorOutside, front, out: frame.n, sidewalk, road, farSidewalk, trees, farTrees, planters,
    lamps, farLamps, terrace: { side: tSide, a: tA, deck, tables, plants, hedges }, apron, obstacles, lane, reception, corridor,
  }
}

/** Terrace corners only: what a phone-portrait default view must contain besides the room (the street needs Centrar vista). */
export function terraceContextPoints(plan: UrbanPlan): Pt[] {
  const deck = plan.terrace.deck
  return [deck.a0, deck.a1].map(a => toWorld(plan.terrace.side, a, DECK_DEPTH + 0.6))
}

/** Framing points (world, y = 0) that keep the street, sidewalk ends and terrace inside the default view. */
export function contextPoints(plan: UrbanPlan): Pt[] {
  const pts: Pt[] = []
  const f = SIDE_FRAMES[plan.side]
  for (const a of [-f.half - 1.5, f.half + 1.5]) pts.push(toWorld(plan.side, a, SIDEWALK_DEPTH + CURB_WIDTH + 1))
  const deck = plan.terrace.deck
  for (const a of [deck.a0, deck.a1]) pts.push(toWorld(plan.terrace.side, a, DECK_DEPTH + 0.6))
  return pts
}

/** Placement of a wall-local group in the world: its position and rotation about Y (local +x = along, +z = out). */
export function sideTransform(side: WallSide): { x: number; z: number; rotationY: number } {
  const f = SIDE_FRAMES[side]
  return { x: f.n[0] * f.face, z: f.n[1] * f.face, rotationY: f.theta }
}
