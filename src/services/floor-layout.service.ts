import { http } from '@/api/http'
import { FLOOR, GRID_STEP } from '@/components/restaurant-3d/floor'
import type {
  RestaurantLayoutDocument,
  RestaurantTableConfig,
  RestaurantTableShape,
} from '@/types/restaurant-3d/restaurant-layout'

/** Wire shape of `data.floor_layout` (Layout V1 + the server's `updated_at`). */
interface FloorLayoutPayload {
  version: number
  floor: { width: number; depth: number; gridStep: number }
  tables: Array<{
    id: string
    number: number
    shape: RestaurantTableShape
    seats: number
    position: { x: number; z: number }
    rotation: number
    backendTableId?: number | null
  }>
  updated_at: string | null
  entrance?: { x: number; z: number } | null
}

interface FloorLayoutEnvelope {
  data: { floor_layout: FloorLayoutPayload | null }
}

/** The server returned a document this build of the editor cannot render. */
export class UnsupportedFloorLayoutError extends Error {
  constructor(reason: string) {
    super(`Unsupported floor layout: ${reason}`)
    this.name = 'UnsupportedFloorLayoutError'
  }
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9

/**
 * The editor renders one fixed floor (`FLOOR` / `GRID_STEP`). A stored document
 * with another version or another floor must fail loudly instead of being
 * drawn with the wrong bounds.
 */
function toDocument(payload: FloorLayoutPayload): RestaurantLayoutDocument {
  if (payload.version !== 1) throw new UnsupportedFloorLayoutError(`version ${payload.version}`)
  const { width, depth, gridStep } = payload.floor
  if (!sameNumber(width, FLOOR.width) || !sameNumber(depth, FLOOR.depth) || !sameNumber(gridStep, GRID_STEP)) {
    throw new UnsupportedFloorLayoutError(`floor ${width}x${depth} / grid ${gridStep}`)
  }
  const tables: RestaurantTableConfig[] = payload.tables.map((table) => ({
    id: table.id,
    number: table.number,
    shape: table.shape,
    seats: table.seats,
    position: { x: table.position.x, z: table.position.z },
    rotation: table.rotation,
    ...(table.backendTableId === undefined ? {} : { backendTableId: table.backendTableId }),
  }))
  return {
    version: 1,
    floor: { width, depth, gridStep },
    ...(payload.entrance === undefined ? {} : { entrance: payload.entrance }),
    tables,
  }
}

/**
 * Restaurant 3D floor layout — full-document contract of restaurants-api:
 *   GET /api/v1/restaurants/{restaurant}/floor-layout   → {data:{floor_layout: doc | null}}
 *   PUT /api/v1/restaurants/{restaurant}/floor-layout   → {message, data:{floor_layout: doc}}
 * No per-table endpoints exist (or should be added): the editor saves one
 * document, replaced atomically.
 */
export const floorLayoutService = {
  /** `null` when the restaurant has never saved a layout. */
  async get(restaurantId: number, signal?: AbortSignal): Promise<RestaurantLayoutDocument | null> {
    const { data } = await http.get<FloorLayoutEnvelope>(`/api/v1/restaurants/${restaurantId}/floor-layout`, { signal })
    return data.data.floor_layout ? toDocument(data.data.floor_layout) : null
  },

  /** Returns the canonical document the server stored. */
  async replace(restaurantId: number, document: RestaurantLayoutDocument): Promise<RestaurantLayoutDocument> {
    const { data } = await http.put<FloorLayoutEnvelope & { message: string }>(
      `/api/v1/restaurants/${restaurantId}/floor-layout`,
      document,
    )
    if (!data.data.floor_layout) throw new UnsupportedFloorLayoutError('empty response')
    return toDocument(data.data.floor_layout)
  },
}
