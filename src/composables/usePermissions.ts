import { computed } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useRestaurantStore } from '@/stores/restaurant'
import type { OrganizationContext, PermissionSlug, PlatformPermissionSlug, RestaurantContext } from '@/types/auth-context'

/**
 * The single place restaurants-web turns GET /auth/context into UX
 * decisions (CLAUDE.md §9/§10 + Passo 1.2C): show, hide, enable, disable,
 * guard navigation. The backend Policies remain the only real
 * authorization — this only avoids offering an action the backend would
 * refuse, and NEVER decides by role name (`role === 'owner'` and friends
 * are forbidden here on purpose; every check below reads a permission
 * slug, never a role).
 *
 * Every helper is fail-closed: while the context is loading, missing, or
 * the last fetch failed, every can()/canOrganization()/canPlatform() call
 * returns false rather than guessing "probably yes" — this is what
 * prevents a momentary flash of admin-only UI on a fresh session.
 *
 * `can()`/`canAny()` evaluate the CURRENT restaurant's permission list
 * only (never another restaurant's — see restaurant.ts's own scoping
 * docblock), which is why they read `useRestaurantStore().currentRestaurantId`
 * on every call: switching restaurants changes the result immediately,
 * with nothing left over from the previous one.
 */
export function usePermissions() {
  const authStore = useAuthStore()
  const restaurantStore = useRestaurantStore()

  const currentOrganizationContext = computed<OrganizationContext | null>(() => {
    const ctx = authStore.authContext
    const restaurantId = restaurantStore.currentRestaurantId
    if (!ctx || restaurantId === null) return null

    return ctx.organizations.find((organization) => organization.restaurants.some((r) => r.id === restaurantId)) ?? null
  })

  const currentRestaurantContext = computed<RestaurantContext | null>(() => {
    const organization = currentOrganizationContext.value
    const restaurantId = restaurantStore.currentRestaurantId
    if (!organization || restaurantId === null) return null

    return organization.restaurants.find((r) => r.id === restaurantId) ?? null
  })

  /** Does the CURRENT restaurant's permission list include this slug? */
  function can(permission: PermissionSlug): boolean {
    return currentRestaurantContext.value?.permissions.includes(permission) ?? false
  }

  /** Does the CURRENT restaurant's permission list include any of these slugs? */
  function canAny(permissions: PermissionSlug[]): boolean {
    return permissions.some((permission) => can(permission))
  }

  /**
   * Same check as `can()`, but for an EXPLICIT restaurant id rather than
   * the current one — needed when a decision has to be made for a
   * restaurant the user hasn't switched to (yet), e.g. useStaffTableEntry
   * picking a QR scan's destination before restaurantStore has selected
   * that restaurant (Carta 8.1B). Reads the auth context directly, never
   * `currentRestaurantContext`.
   */
  function canOnRestaurant(restaurantId: number, permission: PermissionSlug): boolean {
    const ctx = authStore.authContext
    if (!ctx) return false
    for (const organization of ctx.organizations) {
      const restaurant = organization.restaurants.find((r) => r.id === restaurantId)
      if (restaurant) return restaurant.permissions.includes(permission)
    }
    return false
  }

  /** Same as `canOnRestaurant`, for any of several slugs. */
  function canAnyOnRestaurant(restaurantId: number, permissions: PermissionSlug[]): boolean {
    return permissions.some((permission) => canOnRestaurant(restaurantId, permission))
  }

  /**
   * Organization-level capability — the org-wide bucket only (see
   * AuthContextBuilder's docblock), for actions that are never
   * restaurant-scoped (e.g. manage_organization, manage_users). Never
   * conflated with can(), which is restaurant-scoped.
   */
  function canOrganization(permission: PermissionSlug): boolean {
    return currentOrganizationContext.value?.permissions.includes(permission) ?? false
  }

  /**
   * CARTA 8.2B — the derived `can_manage_table_structure` for the CURRENT
   * restaurant (see RestaurantContext's own docblock). A UX projection,
   * never re-derived from `manage_tables`/`manage_floor_plan`/a role here
   * — the backend already folds those plus the restaurant's
   * `waiter_table_management_enabled` setting into this one boolean.
   */
  const canManageTableStructure = computed(() => currentRestaurantContext.value?.can_manage_table_structure ?? false)

  /** Platform-scope capability — entirely separate from tenant/organization/restaurant permissions. */
  function canPlatform(permission: PlatformPermissionSlug): boolean {
    return authStore.authContext?.platform.permissions.includes(permission) ?? false
  }

  const isPlatformAdmin = computed(() => authStore.authContext?.platform.is_platform_admin ?? false)

  function refreshAuthContext(): Promise<void> {
    return authStore.refreshAuthContext()
  }

  return {
    can,
    canAny,
    canOnRestaurant,
    canAnyOnRestaurant,
    canManageTableStructure,
    canOrganization,
    canPlatform,
    isPlatformAdmin,
    currentOrganizationContext,
    currentRestaurantContext,
    refreshAuthContext,
  }
}
