/**
 * Shapes confirmed against the live backend (restaurants-api @ develop):
 *   App\Http\Resources\Api\V1\StaffResource,
 *   App\Http\Requests\Api\V1\Staff\{Store,Update}StaffRequest,
 *   App\Actions\Staff\{Create,Update}StaffAction,
 *   App\Policies\StaffPolicy,
 *   App\Http\Resources\Api\V1\Staff\{StaffShift,StaffPerformance}Resource.
 *
 * Two facts about this contract drive most of the UI:
 *
 *   1. `status` is TENANT-scoped, and only tenant-scoped (Passo 2.8C). It is
 *      `organization_users.status` — this person's membership in THIS
 *      organization — and its only values are `active` and `inactive`
 *      (OrganizationUser::STATUSES). It is NOT `users.status`, the
 *      platform-level flag whose values include `suspended`: that one
 *      belongs to Platform Admin, the Staff API cannot touch it, and this
 *      frontend must never send `suspended` nor describe a deactivation as
 *      a global/platform suspension. Deactivating removes operational
 *      access to this organization (ResolveTenant only accepts an active
 *      membership) and nothing more — the person, their history, role,
 *      restaurants, employee codes, shifts and reviews all stay.
 *   2. There is NO DELETE endpoint. Removing someone is not expressible —
 *      deactivation is the reversible alternative, never a deletion.
 *
 * See the Passo 2.8 report for the DELETE pendency.
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

/**
 * The only two states this API exposes or accepts. `suspended` is deliberately
 * absent: it exists on `users.status` (platform level) and sending it here
 * would be rejected by UpdateStaffRequest — and would mean something the
 * owner of a restaurant has no authority to do.
 */
export type StaffStatus = 'active' | 'inactive'

export interface StaffMember {
  id: number
  name: string
  email: string
  /** Membership status in the ACTIVE organization — `active` unless deactivated here. */
  status: StaffStatus
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
 * password here (the API offers no way to change one).
 * `restaurant_assignments`, when sent, REPLACES the whole set and must keep
 * at least one entry.
 *
 * `status` is sent ALONE (never merged into a profile edit) so that the one
 * request the owner fires to deactivate somebody carries exactly that
 * intent — and so a 403 on self-deactivation can never half-apply a name or
 * role change the owner also made.
 */
export interface UpdateStaffPayload {
  name?: string
  email?: string
  role?: StaffRoleSlug
  status?: StaffStatus
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
