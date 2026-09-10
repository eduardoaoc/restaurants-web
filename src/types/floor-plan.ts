/**
 * Shapes confirmed against the live backend's OpenAPI contract (L5-swagger):
 * GET /api/v1/restaurants/{restaurant}/floor-plan,
 * PATCH /api/v1/restaurants/{restaurant}/floor-plan/layout,
 * GET/POST /api/v1/restaurants/{restaurant}/floors, GET/PATCH/DELETE
 * /api/v1/floors/{floor}, GET/POST /api/v1/restaurants/{restaurant}/zones,
 * GET/PATCH/DELETE /api/v1/zones/{zone}, GET/POST
 * /api/v1/restaurants/{restaurant}/tables, GET/PATCH /api/v1/tables/{table}.
 *
 * NOTE: there is no DELETE endpoint for a Table anywhere in this API (only
 * GET/PATCH on /api/v1/tables/{table}) — never build a "remove table" action
 * against a delete call that does not exist (see CLAUDE.md's critical rule:
 * backend doesn't have it → frontend doesn't implement it).
 */
export interface FloorPlanTableLayout {
  /** Normalized 0..1 canvas coordinates, resolution-independent — never converted to pixels in stored state. */
  x: number | null
  y: number | null
  rotation: number
  /** One of: round, square, rectangle. */
  shape: string
  width: number
  height: number
}

export interface FloorPlanActiveSession {
  id: number
  status: string
  guest_count: number
  opened_at: string
}

export interface FloorPlanTable {
  id: number
  restaurant_id: number
  name: string
  number: number | null
  capacity: number | null
  public_token: string
  status: string
  zone_id: number | null
  layout: FloorPlanTableLayout
  has_active_session: boolean
  active_session: FloorPlanActiveSession | null
  created_at: string
  updated_at: string
}

export interface FloorPlanZone {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  tables: FloorPlanTable[]
}

export interface FloorPlanFloor {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  zones: FloorPlanZone[]
}

export interface FloorPlan {
  restaurant_id: number
  floors: FloorPlanFloor[]
  /** Every table with no zone_id yet — must still be rendered/placeable, never dropped. */
  unassigned_tables: FloorPlanTable[]
}

export interface Floor {
  id: number
  restaurant_id: number
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Zone {
  id: number
  restaurant_id: number
  floor_id: number
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateFloorPayload {
  name: string
  sort_order?: number
  is_active?: boolean
}

export interface CreateZonePayload {
  name: string
  floor_id: number
  sort_order?: number
  is_active?: boolean
}

export interface CreateTablePayload {
  name: string
  number?: number | null
  capacity?: number | null
  zone_id?: number | null
  layout_x?: number
  layout_y?: number
  layout_rotation?: number
  layout_shape?: string
  layout_width?: number
  layout_height?: number
}

/** Every field but `id` is optional — PATCH-per-item semantics, send only what changed. */
export interface LayoutTableUpdate {
  id: number
  zone_id?: number | null
  layout_x?: number
  layout_y?: number
  layout_rotation?: number
  layout_shape?: string
  layout_width?: number
  layout_height?: number
}

/** 409 conflict codes returned by DELETE /floors/{floor} and DELETE /zones/{zone}. */
export type FloorPlanConflictCode = 'FLOOR_HAS_ZONES' | 'ZONE_HAS_TABLES'
