import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'
import {
  CHAIR_BACK_HEIGHT,
  CHAIR_SEAT_HEIGHT,
  CHAIR_SEAT_SIZE,
  getChairPlacements,
  getGuestPlacements,
} from '../table-geometry'
import { CHARACTER_CATALOG, type CharacterGender } from './character-catalog'
import type { ChairSpec } from './test-chair'

/**
 * Pure helpers that decide WHICH customers exist, WHERE they sit and WHAT they look like.
 * No three.js / Vue state here, so it is unit-testable and the scene component stays a thin renderer.
 * Customers only ever exist for explicit guest records (`state.guests`); empty seats get nobody.
 */

/** The production chair (table-geometry.ts) expressed as the ChairSpec the seating alignment understands. */
export const TABLE_CHAIR_SPEC: ChairSpec = {
  seatHeight: CHAIR_SEAT_HEIGHT,
  seatDepth: CHAIR_SEAT_SIZE,
  seatWidth: CHAIR_SEAT_SIZE,
  orientationDeg: 0,
  // RestaurantTable puts the backrest flush with the rear edge of the seat.
  backrestOffset: 0,
  backrestHeight: CHAIR_BACK_HEIGHT,
  // The table edge is only 0.18 m beyond the chair centre: sit 3 cm further back than the lab default
  // so the torso clears the table (the extra depth only hides inside the 4 cm backrest).
  pelvisClearance: 0.16,
}

export interface CustomerPlacement {
  /** Stable identity: the guest assignment id. */
  guestId: string
  tableId: string
  seatIndex: number
  /** World position of the chair centre on the floor (metres). */
  x: number
  z: number
  /** World yaw (radians) so local +Z, the direction the customer faces, points at the table. */
  yaw: number
}

/**
 * Table-local chair position/rotation -> world. Matches how RestaurantTable nests its groups:
 * the table group is translated then rotated about Y, and a chair is placed inside it.
 */
export function chairWorldTransform(
  table: Pick<RestaurantTableConfig, 'position' | 'rotation'>,
  local: { x: number; z: number; rotationY: number },
): { x: number; z: number; yaw: number } {
  const theta = (table.rotation * Math.PI) / 180
  const sin = Math.sin(theta)
  const cos = Math.cos(theta)
  return {
    // Rotation about +Y (three.js convention): x' = x cos + z sin, z' = -x sin + z cos.
    x: table.position.x + local.x * cos + local.z * sin,
    z: table.position.z - local.x * sin + local.z * cos,
    yaw: theta + local.rotationY,
  }
}

export function computeCustomerPlacements(
  tables: readonly RestaurantTableConfig[],
  states: RestaurantOperationalState,
): CustomerPlacement[] {
  const out: CustomerPlacement[] = []
  for (const table of tables) {
    const guests = states[table.id]?.guests
    if (!guests?.length) continue
    for (const g of getGuestPlacements(table, guests)) {
      const w = chairWorldTransform(table, g)
      out.push({ guestId: g.id, tableId: table.id, seatIndex: g.seatIndex, x: w.x, z: w.z, yaw: w.yaw })
    }
  }
  return out
}

/** FNV-1a with a final avalanche so near-identical ids (`guest-table-2-1`, `-2`) spread well. */
export function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export interface CustomerVariant {
  gender: CharacterGender
  /** Variant file under `optimized/` (the loader swaps it for the single-draw-call customer build). */
  url: string
}

/** Men and women interleaved, so the low bit of the hash decides gender and the rest the outfit. */
const POOL: CustomerVariant[] = [0, 1, 2].flatMap((i) => [
  { gender: 'men' as const, url: CHARACTER_CATALOG.men.variants[i].url },
  { gender: 'women' as const, url: CHARACTER_CATALOG.women.variants[i].url },
])

/** Deterministic appearance from the guest id alone: never changes between renders or reloads. */
export function customerVariant(guestId: string): CustomerVariant {
  return POOL[hashId(guestId) % POOL.length]
}

/** 0..1 phase so seated idle loops of different customers are not in lock-step. Also id-derived. */
export function customerPhase(guestId: string): number {
  return (hashId(`${guestId}:phase`) % 1000) / 1000
}

/** Chair frame of a seat, whether or not anybody sits there (used by the temporary chairs and the planners). */
export function seatFrameOf(
  tables: readonly RestaurantTableConfig[],
  tableId: string,
  seatIndex: number,
): { x: number; z: number; yaw: number; ref: { tableId: string; chairIndex: number } } | null {
  const table = tables.find((t) => t.id === tableId)
  const chair = table ? getChairPlacements(table)[seatIndex] : undefined
  if (!table || !chair) return null
  const w = chairWorldTransform(table, chair)
  return { x: w.x, z: w.z, yaw: w.yaw, ref: { tableId, chairIndex: seatIndex } }
}
