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

/**
 * A table's CONFIGURATION status — confirmed against the real
 * UpdateTableRequest (`Rule::in(['active','blocked','inactive'])`). Never
 * conflated with the operational `primary_status` (free/occupied/
 * bill_requested/... — see src/types/operations.ts), which is derived from
 * the live session and is a completely different axis: a table can be
 * `active` (exists, bookable) and `occupied` (someone is sitting at it) at
 * the same time. StoreTableRequest has no `status` field at all — the
 * controller always creates tables as 'active'.
 */
export type TableStatus = 'active' | 'blocked' | 'inactive'

export const TABLE_STATUSES: readonly TableStatus[] = ['active', 'blocked', 'inactive']

/** Shapes accepted by the backend — `Table::SHAPES` (round/square/rectangle). */
export const TABLE_SHAPES: readonly string[] = ['round', 'square', 'rectangle']

/**
 * PATCH /api/v1/tables/{table} body. Every field is `sometimes` on the
 * backend, so only what actually changed is ever sent.
 *
 * IMPORTANT (real backend rule, TableController::LAYOUT_FIELDS): touching
 * ANY of zone_id/layout_* additionally requires `manage_floor_plan` on top
 * of `manage_tables`. The identity fields (name/number/capacity/status)
 * need only `manage_tables`. useFloorPlanEditor splits the payload
 * accordingly so a manage_tables-only user never triggers a 403 by
 * accidentally including a layout field.
 */
export interface UpdateTablePayload {
  name?: string
  number?: number | null
  capacity?: number | null
  status?: TableStatus
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
