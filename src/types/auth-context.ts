/**
 * Shape confirmed against the live backend (restaurants-api,
 * App\Support\Auth\AuthContextBuilder / AuthContextResource) —
 * GET /api/v1/auth/context returns exactly this shape, wrapped in
 * `{ data: ... }`. This is a READ PROJECTION over the real role/permission
 * relationships (see AuthContextBuilder's own docblock) — the Policies
 * remain the only place authorization is actually enforced; this context
 * only describes what those Policies would currently allow, for UX.
 *
 * Scoping (see AuthContextBuilder + RestaurantScope):
 *   - `organizations[].permissions` is the ORGANIZATION-WIDE bucket only
 *     (role assignments with restaurant_id null) — never inflated by a
 *     restaurant-scoped grant.
 *   - `organizations[].restaurants[].permissions` is the union of that
 *     same org-wide bucket plus whatever is granted specifically at that
 *     restaurant — this is what `can()` (src/composables/usePermissions.ts)
 *     evaluates for restaurant-scoped actions, never a permission list from
 *     a different restaurant.
 */

/**
 * Tenant-scope permission slugs seeded by the backend
 * (database/seeders/PermissionSeeder.php). Kept as an open union — like
 * TableFlag/OperationsAlertType elsewhere in this codebase — so the
 * backend can introduce a new permission without requiring a frontend
 * release; `can()`/`canOrganization()` still work correctly for any string
 * the backend actually sends, known or not.
 */
export type PermissionSlug =
  | 'manage_organization'
  | 'manage_restaurants'
  | 'manage_users'
  | 'manage_menu'
  | 'manage_products'
  | 'manage_product_availability'
  | 'manage_tables'
  | 'manage_floor_plan'
  | 'assign_waiters'
  | 'manage_staff_shifts'
  | 'transfer_tables'
  | 'view_operations'
  | 'approve_customer_orders'
  | 'create_orders'
  | 'update_kitchen_status'
  | 'serve_orders'
  | 'handle_table_requests'
  | 'record_payments'
  | 'close_bill'
  | 'view_reports'
  | 'view_audit'
  | 'manage_staff_reviews'
  | 'view_customer_feedback'
  | 'view_activity'
  | 'open_daily_operation'
  | 'close_daily_operation'
  | 'view_daily_closes'
  | (string & {})

/**
 * Platform-scope permission slugs (database/seeders/PlatformPermissionSeeder.php)
 * — entirely separate namespace from PermissionSlug, never mixed with
 * tenant/organization/restaurant permissions (CLAUDE.md's "never confuse
 * platform with tenant" rule, and the backend's own `platform_` prefix
 * convention).
 */
export type PlatformPermissionSlug =
  | 'view_platform_users'
  | 'manage_platform_users'
  | 'view_platform_organizations'
  | 'manage_platform_organizations'
  | 'view_platform_restaurants'
  | 'manage_platform_restaurants'
  | 'view_platform_audit'
  | (string & {})

export interface AuthContextUser {
  id: number
  name: string
  email: string
  status: string
}

export interface PlatformContext {
  is_platform_admin: boolean
  roles: string[]
  permissions: PlatformPermissionSlug[]
}

export interface RestaurantContext {
  id: number
  name: string
  slug: string
  status: string
  roles: string[]
  permissions: PermissionSlug[]
  /**
   * Derived capability (CARTA 8.2A/8.2B), computed by the backend's
   * `TablePolicy::manageStructure` for THIS restaurant: true with
   * `manage_floor_plan`; otherwise `manage_tables` AND
   * `RestaurantSettings.waiter_table_management_enabled`. Governs creating
   * a table and changing name/number/capacity/zone/layout — never
   * `status` alone, which stays gated by plain `manage_tables` regardless
   * of this value (confirmed against the live OpenAPI contract). A UX
   * projection only: the API still answers 403 if it changed since this
   * context was fetched — never replicate the backend rule, only read
   * this field (CLAUDE.md §9/§19).
   */
  can_manage_table_structure: boolean
}

export interface OrganizationContext {
  id: number
  name: string
  slug: string
  status: string
  roles: string[]
  permissions: PermissionSlug[]
  restaurants: RestaurantContext[]
}

export interface AuthContext {
  user: AuthContextUser
  platform: PlatformContext
  organizations: OrganizationContext[]
}

/**
 * Carta 8.1B — the exact permission set that grants access to `/app/service`
 * (a waiter/cashier's own operational subset — anyone who can act on a
 * table without full `view_operations`). This is the single source both
 * router/index.ts's guard and useStaffTableEntry's QR-scan destination
 * read, so the two can never diverge into a staff member who reaches the
 * route one way but not the other.
 */
export const SERVICE_ACCESS_PERMISSIONS: PermissionSlug[] = [
  'view_operations',
  'create_orders',
  'approve_customer_orders',
  'serve_orders',
  'record_payments',
  'close_bill',
  'handle_table_requests',
]
