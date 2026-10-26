import { PhArmchair, PhBellRinging, PhBookOpen, PhCashRegister, PhChefHat, PhGauge, PhGear, PhStar, PhUsersThree } from '@phosphor-icons/vue'
import type { Component } from 'vue'
import { SERVICE_ACCESS_PERMISSIONS, type PermissionSlug } from '@/types/auth-context'

export type NavigationGroup = 'operation' | 'management' | 'footer'
export interface ShellDestination {
  id: string
  routeName: string
  labelKey: string
  icon: Component
  group: NavigationGroup
  priority: number
  permission?: PermissionSlug | PermissionSlug[]
  organizationPermission?: PermissionSlug
}
export interface ShellNavItem extends ShellDestination {
  active: boolean
  badge?: { count: number; labelKey: string }
}
export interface NavigationAccess {
  can: (permission: PermissionSlug) => boolean
  canAny: (permissions: PermissionSlug[]) => boolean
  canOrganization: (permission: PermissionSlug) => boolean
}

// One source for legacy and V2. Array order preserves the legacy rail;
// priority defines the shared operational order for every V2 presentation.
export const SHELL_DESTINATIONS: ShellDestination[] = [
  { id: 'dashboard', routeName: 'app-dashboard', labelKey: 'common.dashboard', icon: PhGauge, group: 'operation', priority: 20, permission: ['view_operations', 'view_reports'] },
  // Preserve the existing nav gate. The Kitchen route independently also
  // accepts serve_orders; this phase does not change its authorization.
  { id: 'kitchen', routeName: 'app-kitchen', labelKey: 'kitchen.title', icon: PhChefHat, group: 'operation', priority: 30, permission: 'update_kitchen_status' },
  { id: 'service', routeName: 'app-service', labelKey: 'service.title', icon: PhBellRinging, group: 'operation', priority: 10, permission: SERVICE_ACCESS_PERMISSIONS },
  { id: 'menu', routeName: 'app-menu', labelKey: 'common.menu', icon: PhBookOpen, group: 'management', priority: 50, permission: 'manage_menu' },
  { id: 'day-close', routeName: 'app-day-close', labelKey: 'dayClose.pageTitle', icon: PhCashRegister, group: 'management', priority: 40, permission: ['open_daily_operation', 'close_daily_operation', 'view_daily_closes'] },
  // This is table configuration, not a new operational "Sala" destination.
  { id: 'tables', routeName: 'app-tables', labelKey: 'common.tables', icon: PhArmchair, group: 'management', priority: 60, permission: 'manage_tables' },
  { id: 'staff', routeName: 'app-staff', labelKey: 'staff.pageTitle', icon: PhUsersThree, group: 'management', priority: 70, permission: 'manage_users' },
  { id: 'feedback', routeName: 'app-feedback', labelKey: 'feedback.pageTitle', icon: PhStar, group: 'management', priority: 80, permission: 'view_customer_feedback' },
  // Same OR across scopes as the existing UserMenu and Settings route.
  { id: 'settings', routeName: 'app-settings', labelKey: 'common.settings', icon: PhGear, group: 'footer', priority: 90, permission: 'manage_restaurants', organizationPermission: 'manage_organization' },
]

/** Explicit name boundary covers existing detail routes and future children
 * without matching e.g. app-menu-other as another parent's exact page. */
export function isDestinationActive(item: Pick<ShellDestination, 'routeName'>, routeName: unknown, matchedNames: unknown[] = []): boolean {
  return [routeName, ...matchedNames].some(name => typeof name === 'string' && (name === item.routeName || name.startsWith(`${item.routeName}-`)))
}

export function resolveShellNavigation(access: NavigationAccess, routeName: unknown, matchedNames: unknown[] = [], readyCount = 0): ShellNavItem[] {
  return SHELL_DESTINATIONS.filter(item => {
    const restaurant = !item.permission || (Array.isArray(item.permission) ? access.canAny(item.permission) : access.can(item.permission))
    return restaurant || !!item.organizationPermission && access.canOrganization(item.organizationPermission)
  }).map(item => ({
    ...item,
    active: isDestinationActive(item, routeName, matchedNames),
    ...(item.id === 'service' && readyCount > 0 ? { badge: { count: readyCount, labelKey: 'appShell.readyCount' } } : {}),
  }))
}

export function partitionShellNavigation(items: ShellNavItem[], mode: 'bottom' | 'rail' | 'sidebar') {
  const ordered = [...items].sort((a, b) => a.priority - b.priority)
  const candidates = ordered.filter(item => item.group !== 'footer')
  const primary = mode === 'sidebar' ? ordered : candidates.slice(0, mode === 'bottom' ? 4 : 6)
  const overflow = ordered.filter(item => !primary.includes(item))
  return { primary, overflow, moreActive: overflow.some(item => item.active), moreCount: overflow.reduce((sum, item) => sum + (item.badge?.count ?? 0), 0) }
}

export function groupShellNavigation(items: ShellNavItem[], grouped: boolean) {
  if (!grouped) return [{ id: 'all', labelKey: undefined, items }]
  return (['operation', 'management', 'footer'] as const).map(id => ({
    id, labelKey: id === 'footer' ? undefined : `appShell.${id}`, items: items.filter(item => item.group === id),
  })).filter(group => group.items.length > 0)
}
