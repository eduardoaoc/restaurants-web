import { FLOOR } from './floor'

/**
 * Pure plan of the KayKit room envelope (Phase 3.1K-C1): where each wall piece, the kitchen run and the bar run go.
 * Everything here is visual/static: nothing is persisted and no table ID is involved. The persisted 20 x 16 m floor is
 * the contract, so the walls stand just OUTSIDE its edge (inner face flush with the floor) instead of inside it, where
 * the previous walls swallowed the outer 0.75 m that the editor still treats as usable floor.
 */
export const HALF_W = FLOOR.width / 2
export const HALF_D = FLOOR.depth / 2
/** KayKit wall module: 4 m long, 0.5 m thick (model units). */
export const WALL_MODULE = 4
export const WALL_THICKNESS = 0.5
/** The model is 4 m tall; 0.9 gives a 3.6 m room and a 1.9 m doorway, in proportion with the 1 m counters. */
export const WALL_HEIGHT_SCALE = 0.9
/** Clear width of the model's doorway opening (x = +-0.8). */
export const DOORWAY_WIDTH = 1.6
/** Wall centre line offset from the origin (the wall's inner face is the floor edge). */
export const WALL_CENTER_X = HALF_W + WALL_THICKNESS / 2
export const WALL_CENTER_Z = HALF_D + WALL_THICKNESS / 2

export type WallSide = 'north' | 'south' | 'east' | 'west'
export type WallPieceKind = 'wall' | 'window' | 'doorway'

export interface WallPiece {
  side: WallSide
  kind: WallPieceKind
  /** Centre along the wall (x for north/south, z for east/west). */
  along: number
  /** Scale along the wall (1 = the 4 m module). */
  stretch: number
}

/** Terrace doorway on the east wall, fixed by the terrace reservation (z = 0.75). */
export const TERRACE_DOOR_Z = 0.75

/** Wall side + position of the entrance doorway: the nearest floor edge to the saved entrance. */
export function entranceDoorway(entrance: { x: number; z: number } | null | undefined): { side: WallSide; along: number } | null {
  if (!entrance || !Number.isFinite(entrance.x) || !Number.isFinite(entrance.z)) return null
  const candidates: Array<{ side: WallSide; dist: number; along: number }> = [
    { side: 'west', dist: entrance.x + HALF_W, along: entrance.z },
    { side: 'east', dist: HALF_W - entrance.x, along: entrance.z },
    { side: 'north', dist: entrance.z + HALF_D, along: entrance.x },
    { side: 'south', dist: HALF_D - entrance.z, along: entrance.x },
  ]
  const best = candidates.reduce((a, b) => (b.dist < a.dist ? b : a))
  return { side: best.side, along: best.along }
}

/** Wall run limits along each side: north/south run through the corners; east/west stop at the floor edge. */
export function sideSpan(side: WallSide): [number, number] {
  const limit = side === 'north' || side === 'south' ? HALF_W + WALL_THICKNESS : HALF_D
  return [-limit, limit]
}

/** Kitchen run occupies the north-west wall (x < KITCHEN_END_X): no windows there, a fridge stands against it. */
export const KITCHEN_END_X = -2

/**
 * Splits each side into pieces. A doorway module is centred on its opening (clamped so it stays on the wall); the
 * stretches between are filled with the fewest whole modules, each stretched to fit (windows only on modules within 12 % of natural size).
 */
export function planWalls(entrance: { x: number; z: number } | null | undefined): WallPiece[] {
  const doors: Array<{ side: WallSide; along: number }> = [{ side: 'east', along: TERRACE_DOOR_Z }]
  const entry = entranceDoorway(entrance)
  if (entry) doors.push(entry)
  const pieces: WallPiece[] = []
  for (const side of ['north', 'south', 'east', 'west'] as const) {
    const [from, to] = sideSpan(side)
    const half = WALL_MODULE / 2
    const openings = doors
      .filter(door => door.side === side)
      .map(door => Math.min(to - half, Math.max(from + half, door.along)))
      .sort((a, b) => a - b)
    let cursor = from
    const fill = (end: number): void => {
      const length = end - cursor
      if (length < 0.2) return
      const count = Math.max(1, Math.round(length / WALL_MODULE))
      const stretch = length / count / WALL_MODULE
      for (let i = 0; i < count; i++) {
        const along = cursor + (length / count) * (i + 0.5)
        const windowed = i % 2 === 1 || count === 1
        const kitchen = side === 'north' && along < KITCHEN_END_X
        const kind: WallPieceKind = windowed && !kitchen && stretch > 0.88 && stretch < 1.12 ? 'window' : 'wall'
        pieces.push({ side, kind, along, stretch })
      }
      cursor = end
    }
    for (const wanted of openings) {
      const center = Math.max(wanted, cursor + half)
      fill(center - half)
      pieces.push({ side, kind: 'doorway', along: center, stretch: 1 })
      cursor = center + half
    }
    fill(to)
  }
  return pieces
}

export type ServiceModel = 'fridge' | 'counter' | 'sink' | 'stove'
export interface ServiceItem {
  model: ServiceModel
  x: number
  z: number
}

/** All KayKit service modules are 2 x 2 m (z -1 .. +1.04) and face +z; they stand with their back on the wall. */
export const SERVICE_MODULE = 2
export const SERVICE_BACK_Z = -HALF_D + SERVICE_MODULE / 2
const row = (models: ServiceModel[], startX: number): ServiceItem[] =>
  models.map((model, i) => ({ model, x: startX + SERVICE_MODULE * i, z: SERVICE_BACK_Z }))

/** Kitchen run, north-west corner: fridge, counter, sink, stove (x -10 .. -2). */
export const KITCHEN_ITEMS: readonly ServiceItem[] = row(['fridge', 'counter', 'sink', 'stove'], -HALF_W + SERVICE_MODULE / 2)
/** Service bar, north-east corner: two counters (x 6 .. 10) with a decorated shelf on top. */
export const BAR_ITEMS: readonly ServiceItem[] = row(['counter', 'counter'], HALF_W - SERVICE_MODULE * 1.5)

export interface Footprint {
  x: number
  z: number
  hx: number
  hz: number
}

function footprintOf(items: readonly ServiceItem[]): Footprint {
  const xs = items.map(item => item.x)
  const min = Math.min(...xs) - SERVICE_MODULE / 2
  const max = Math.max(...xs) + SERVICE_MODULE / 2
  const depth = SERVICE_MODULE + 0.04
  return { x: (min + max) / 2, z: -HALF_D + depth / 2, hx: (max - min) / 2, hz: depth / 2 }
}

/** True footprints of the fixed service runs (the rects navigation and the editor treat as blocked). */
export const KITCHEN_FOOTPRINT: Footprint = footprintOf(KITCHEN_ITEMS)
export const BAR_FOOTPRINT: Footprint = footprintOf(BAR_ITEMS)

/** Decorative shelf resting on the bar top (model origin is its back edge; its lowest point is y = -0.1). */
export const BAR_SHELF = { x: BAR_FOOTPRINT.x, y: 1.1, z: -HALF_D + 0.15 } as const
