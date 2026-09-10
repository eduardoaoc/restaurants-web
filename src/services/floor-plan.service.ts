import { http } from '@/api/http'
import type {
  CreateFloorPayload,
  CreateZonePayload,
  Floor,
  FloorPlan,
  LayoutTableUpdate,
  Zone,
} from '@/types/floor-plan'

interface FloorPlanEnvelope {
  data: { floor_plan: FloorPlan }
}
interface FloorsEnvelope {
  data: { floors: Floor[] }
}
interface FloorEnvelope {
  data: { floor: Floor }
}
interface ZonesEnvelope {
  data: { zones: Zone[] }
}
interface ZoneEnvelope {
  data: { zone: Zone }
}
interface UpdateLayoutEnvelope {
  message: string
  data: { tables_updated_count: number }
}

/**
 * Thin wrapper around the real restaurants-api Floor Plan contract:
 *   GET   /api/v1/restaurants/{restaurant}/floor-plan
 *   PATCH /api/v1/restaurants/{restaurant}/floor-plan/layout   (bulk save)
 *   GET/POST /api/v1/restaurants/{restaurant}/floors
 *   GET/POST /api/v1/restaurants/{restaurant}/zones
 * There is no delete endpoint for a Table anywhere in this API — do not add
 * one here (see CLAUDE.md's critical rule: backend doesn't have it, don't
 * build it). Floor/Zone deletes exist but 409 with FLOOR_HAS_ZONES /
 * ZONE_HAS_TABLES when not empty — map those via src/api/errors.ts.
 */
export const floorPlanService = {
  async get(restaurantId: number, signal?: AbortSignal): Promise<FloorPlan> {
    const { data } = await http.get<FloorPlanEnvelope>(`/api/v1/restaurants/${restaurantId}/floor-plan`, {
      signal,
    })
    return data.data.floor_plan
  },

  /** Every item's fields besides `id` are optional (PATCH-per-item semantics). Rejected as a whole (422) on any invalid id. */
  async updateLayout(restaurantId: number, tables: LayoutTableUpdate[]): Promise<number> {
    const { data } = await http.patch<UpdateLayoutEnvelope>(
      `/api/v1/restaurants/${restaurantId}/floor-plan/layout`,
      { tables },
    )
    return data.data.tables_updated_count
  },

  async listFloors(restaurantId: number): Promise<Floor[]> {
    const { data } = await http.get<FloorsEnvelope>(`/api/v1/restaurants/${restaurantId}/floors`)
    return data.data.floors
  },

  async createFloor(restaurantId: number, payload: CreateFloorPayload): Promise<Floor> {
    const { data } = await http.post<FloorEnvelope>(`/api/v1/restaurants/${restaurantId}/floors`, payload)
    return data.data.floor
  },

  async listZones(restaurantId: number): Promise<Zone[]> {
    const { data } = await http.get<ZonesEnvelope>(`/api/v1/restaurants/${restaurantId}/zones`)
    return data.data.zones
  },

  async createZone(restaurantId: number, payload: CreateZonePayload): Promise<Zone> {
    const { data } = await http.post<ZoneEnvelope>(`/api/v1/restaurants/${restaurantId}/zones`, payload)
    return data.data.zone
  },
}
