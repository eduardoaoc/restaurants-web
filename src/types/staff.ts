/**
 * Shapes confirmed against the live backend (restaurants-api @ develop):
 *   App\Http\Resources\Api\V1\StaffResource,
 *   App\Http\Requests\Api\V1\Staff\{Store,Update}StaffRequest,
 *   App\Actions\Staff\{Create,Update}StaffAction,
 *   App\Policies\StaffPolicy,
 *   App\Http\Resources\Api\V1\Staff\{StaffShift,StaffPerformance}Resource.
 *
 * Two facts about this contract drive most of the UI, and both are
 * deliberate absences — never "fix" them on the frontend:
 *
 *   1. There is NO status field. `users.status` exists in the database, but
 *      StaffResource never exposes it and neither Store nor Update accepts
 *      it. So a staff member cannot be activated/deactivated through this
 *      API, and no such control may be offered (CLAUDE.md: the backend
 *      doesn't have it → the frontend doesn't invent it).
 *   2. There is NO DELETE endpoint. Removing someone is not expressible.
 *
 * See the Passo 2.8 report for both, filed as backend pendências.
 */

/**
 * Roles this endpoint accepts, as SLUGS — mirrors
 * StoreStaffRequest::ALLOWED_ROLES exactly. `owner` is intentionally absent:
 * the backend refuses it here ("ownership has its own future flow").
 *
 * PENDÊNCIA BACKEND — ROLE CATALOG: no endpoint exposes assignable roles,
 * and GET /auth/context only reports the CURRENT user's own roles, not a
 * catalog. This constant is the single place the list lives, so wiring a
 * real catalog later is a one-file change — and it holds slugs, never the
 * numeric role_ids the UI must never hardcode.
 */
export const ASSIGNABLE_STAFF_ROLES = ['manager', 'waiter', 'kitchen', 'cashier'] as const

export type StaffRoleSlug = (typeof ASSIGNABLE_STAFF_ROLES)[number]

/** A staff member's role as returned by the API — null when no role row exists for this organization. */
export interface StaffRole {
  id: number
  slug: string
}

/**
 * One restaurant a staff member is assigned to. `sub_id` is the backend's
 * name for a per-restaurant employee code (required, and unique within that
 * restaurant) — surfaced to the owner as "código de empleado", never as
 * "sub_id".
 */
export interface StaffRestaurantAssignment {
  id: number
  name: string
  sub_id: string
}

export interface StaffMember {
  id: number
  name: string
  email: string
  role: StaffRole | null
  restaurants: StaffRestaurantAssignment[]
  created_at: string
  updated_at: string
}

/** POST/PATCH assignment entry — only the two fields the backend validates. */
export interface StaffAssignmentInput {
  restaurant_id: number
  sub_id: string
}

/** POST /api/v1/staff — every field required, including the password the owner sets directly. */
export interface CreateStaffPayload {
  name: string
  email: string
  password: string
  role: StaffRoleSlug
  restaurant_assignments: StaffAssignmentInput[]
}

/**
 * PATCH /api/v1/staff/{user} — every field `sometimes`. Note there is no
 * password here (the API offers no way to change one) and no status.
 * `restaurant_assignments`, when sent, REPLACES the whole set and must keep
 * at least one entry.
 */
export interface UpdateStaffPayload {
  name?: string
  email?: string
  role?: StaffRoleSlug
  restaurant_assignments?: StaffAssignmentInput[]
}

/** GET /api/v1/restaurants/{restaurant}/staff-shifts — requires `manage_staff_shifts`, not `manage_users`. */
export interface StaffShift {
  id: number
  restaurant_id: number
  user: { id: number; name: string } | null
  role: string | null
  started_at: string
  ended_at: string | null
  is_active: boolean
  started_by_user_id: number | null
  ended_by_user_id: number | null
  created_at: string
  updated_at: string
}

/**
 * GET /api/v1/restaurants/{restaurant}/staff/{staff}/performance — requires
 * `view_reports` (StaffPolicy::viewPerformance), scoped to one restaurant.
 * `metrics` keys come from App\Support\Staff\StaffPerformanceService.
 */
export interface StaffPerformanceMetrics {
  tables_served: number
  orders_created: number
  orders_served: number
  customer_orders_approved: number
  table_requests_handled: number
  sessions_closed: number
}

export interface StaffPerformance {
  staff: { id: number; name: string; restaurant: { id: number; name: string } | null }
  scope: string
  period: { from: string; to: string }
  metrics: StaffPerformanceMetrics
  /** `average` is a decimal STRING or null when there are no reviews yet. */
  rating: { average: string | null; review_count: number }
}
