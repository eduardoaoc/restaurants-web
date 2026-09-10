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
