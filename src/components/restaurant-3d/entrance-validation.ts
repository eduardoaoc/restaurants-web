import type { FloorPosition, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { CHAIR_PULL } from './characters/chair-interaction'
import { seatFrameOf } from './characters/customer-placement'
import { FLOOR, GRID_STEP } from './floor'
import { snapToGrid } from './layout-editing'
import { buildNavGrid, validateEntrance, type NavGrid } from './navigation/floor-nav'
import { planArrival } from './navigation/route-path'
import { getChairPlacements } from './table-geometry'

/**
 * Entrance rules for the layout editor. Pure TypeScript (no Vue / three): it reuses the guest navigation grid and
 * planners, so "valid" here means exactly "the guests can walk from it" at runtime. Nothing here moves an entrance
 * to a better place: an unusable position is reported, never corrected.
 */
export type EntranceIssueKind =
  | 'invalid_coordinates'
  | 'outside_floor'
  | 'blocked_by_furniture'
  | 'no_navigation_start'
  | 'unreachable_seating'

export type EntranceValidation =
  | { ok: true }
  | { ok: false; issue: EntranceIssueKind; unreachable?: string[]; /** Visual numbers of the tables owning those seats. */ tableNumbers?: number[] }

/** Representative stand offset (chair-local Z; the real one, ≈ -1.5…-1.7 m, depends on the loaded character model). */
const CHECK_STAND_LOCAL_Z = -(CHAIR_PULL + 0.5)

let limitsCache: FloorPosition | undefined

/**
 * Furthest an entrance may be dragged: the outermost editor-grid line whose navigation start cell is still walkable on
 * an empty floor (the nav cells are 0.15 m, the editor grid 0.25 m, so the geometric edge margin alone is not enough).
 */
export function entranceLimits(): FloorPosition {
  if (limitsCache) return limitsCache
  const empty = buildNavGrid([])
  const axis = (size: number, at: (v: number) => FloorPosition) => {
    for (let v = Math.floor(size / 2 / GRID_STEP) * GRID_STEP; v > 0; v -= GRID_STEP) {
      const probe = at(v)
      if (validateEntranceGeometry(empty, probe).ok && validateEntranceGeometry(empty, { x: -probe.x, z: -probe.z }).ok) return v
    }
    return 0
  }
  limitsCache = { x: axis(FLOOR.width, (v) => ({ x: v, z: 0 })), z: axis(FLOOR.depth, (v) => ({ x: 0, z: v })) }
  return limitsCache
}

/** Snap to the grid and keep inside the navigable floor. Non-finite input is left to `validateEntrancePlacement`. */
export function clampEntrance(wanted: FloorPosition): FloorPosition {
  if (!Number.isFinite(wanted.x) || !Number.isFinite(wanted.z)) return { x: wanted.x, z: wanted.z }
  const limits = entranceLimits()
  const axis = (value: number, max: number) => snapToGrid(Math.min(max, Math.max(-max, snapToGrid(value))))
  return { x: axis(wanted.x, limits.x), z: axis(wanted.z, limits.z) }
}

/** Cheap checks only (no routing): used on placement completion and on every table change. */
export function validateEntranceGeometry(grid: NavGrid, entrance: FloorPosition): EntranceValidation {
  if (!Number.isFinite(entrance.x) || !Number.isFinite(entrance.z)) return { ok: false, issue: 'invalid_coordinates' }
  const basic = validateEntrance(grid, entrance)
  if (!basic.ok) return { ok: false, issue: basic.reason }
  return grid.startCellFree(entrance) ? { ok: true } : { ok: false, issue: 'no_navigation_start' }
}

/**
 * Full validation: geometry, then one arrival route (A*, the same planner guests use) to EVERY configured seat of
 * EVERY table, whatever the current occupancy: a table that is empty now must still be reachable when it fills.
 * Run it on placement completion and before saving, never per pointer move. `unreachable` lists `tableId#seatIndex`;
 * `tables` the visual numbers affected, for the message.
 */
export function validateEntrancePlacement(
  tables: readonly RestaurantTableConfig[],
  entrance: FloorPosition,
): EntranceValidation {
  const grid = buildNavGrid(tables)
  const geometry = validateEntranceGeometry(grid, entrance)
  if (!geometry.ok) return geometry

  const unreachable: string[] = []
  const numbers = new Set<number>()
  for (const table of tables) {
    for (let seatIndex = 0; seatIndex < getChairPlacements(table).length; seatIndex++) {
      const seat = seatFrameOf(tables, table.id, seatIndex)
      if (seat && !planArrival(grid, entrance, seat, CHECK_STAND_LOCAL_Z).ok) {
        unreachable.push(`${table.id}#${seatIndex}`)
        numbers.add(table.number)
      }
    }
  }
  return unreachable.length
    ? { ok: false, issue: 'unreachable_seating', unreachable, tableNumbers: [...numbers].sort((a, b) => a - b) }
    : { ok: true }
}

/**
 * Where "Configure entrance" first puts the marker: the first usable spot walking along the back edge (visible in the
 * default view), then the front edge. Only an INITIAL suggestion for a new entrance (the user then drags it); an existing entrance is never moved.
 */
export function suggestEntrance(tables: readonly RestaurantTableConfig[]): FloorPosition {
  const limits = entranceLimits()
  const grid = buildNavGrid(tables)
  const xs = [0]
  for (let step = 1; step * 1 <= limits.x; step++) xs.push(step, -step)
  // Back edge first: in the default three-quarter view it is on screen, while the front edge sits under the editor dock.
  for (const z of [-limits.z, limits.z]) {
    for (const x of xs) {
      const candidate = clampEntrance({ x, z })
      if (validateEntranceGeometry(grid, candidate).ok) return candidate
    }
  }
  return clampEntrance({ x: 0, z: -limits.z })
}
