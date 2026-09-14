import { createRouter, createWebHistory } from 'vue-router'

import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { useRestaurantStore } from '@/stores/restaurant'
import type { PermissionSlug } from '@/types/auth-context'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    /**
     * Restaurant-scoped capability a route requires (Passo 1.2C, enforced
     * from Passo 2.2 — Carta is the first route to set this). The guard
     * below awaits restaurantStore.load() then checks it against the
     * CURRENT restaurant's permissions, redirecting to the Dashboard on
     * denial. The backend remains the real authority (CLAUDE.md §9) — this
     * only avoids rendering a screen / firing requests the backend would
     * 403 anyway.
     */
    permission?: PermissionSlug
    /**
     * The public QR customer surface (Passo 3.1) — a completely anonymous
     * flow with no concept of an AFORO account. The guard below returns
     * immediately for these routes, before ever touching `auth`/
     * `restaurantStore`: no GET /me, no GET /restaurants, no redirect to
     * /login, ever. A diner's phone has zero reason to depend on the admin
     * session stack succeeding, failing, or even existing.
     */
    public?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/app' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      // Matches the exact format table-public-url.ts already builds
      // (`${VITE_PUBLIC_APP_URL}/t/${public_token}`) and the QR panel
      // already encodes — never change this segment without re-auditing
      // every already-printed QR sheet.
      path: '/t/:publicToken',
      name: 'public-table',
      component: () => import('@/views/public/PublicTableView.vue'),
      meta: { public: true },
    },
    {
      path: '/app',
      component: () => import('@/layouts/AppShellLayout.vue'),
      redirect: { name: 'app-dashboard' },
      meta: { requiresAuth: true },
      children: [
        {
          path: 'kitchen',
          name: 'app-kitchen',
          component: () => import('@/views/kitchen/KitchenView.vue'),
          meta: { permission: 'update_kitchen_status' },
        },
        {
          path: 'dashboard',
          name: 'app-dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'menu',
          name: 'app-menu',
          component: () => import('@/views/menu/MenuView.vue'),
          meta: { permission: 'manage_menu' },
        },
        {
          path: 'tables',
          name: 'app-tables',
          component: () => import('@/views/tables/TablesView.vue'),
          // Configuring the dining room is gated on manage_tables, matching
          // TablePolicy::create/update. Placing tables on the map needs the
          // separate manage_floor_plan on top — enforced per-control inside
          // the view, since the backend splits the two within one endpoint.
          meta: { permission: 'manage_tables' },
        },
        {
          path: 'service',
          name: 'app-service',
          component: () => import('@/views/service/ServiceView.vue'),
          // Deliberately no single `meta.permission` (Passo 3.2) — same
          // reasoning as `settings`: this screen mixes view_operations
          // (see tables), approve_customer_orders (pending approvals) and
          // create_orders (manual order) — a waiter may hold any subset,
          // and the view itself gates each section independently.
        },
        {
          path: 'staff',
          name: 'app-staff',
          component: () => import('@/views/staff/StaffView.vue'),
          // Matches StaffPolicy exactly: every Staff ability is gated on
          // manage_users in the active organization — never a role name.
          meta: { permission: 'manage_users' },
        },
        {
          path: 'settings',
          name: 'app-settings',
          component: () => import('@/views/settings/SettingsView.vue'),
          // Deliberately no single `meta.permission` here (Passo 2.10):
          // this screen mixes an organization-scoped capability
          // (manage_organization) with a restaurant-scoped one
          // (manage_restaurants), and a user may legitimately hold only
          // one of the two — same self-gating pattern as DashboardView's
          // Operación/Análisis tabs, never a redirect-away for a partial
          // capability.
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  // The public QR surface (Passo 3.1) never touches the admin auth/
  // restaurant stack — an anonymous diner's navigation must never wait on,
  // or be redirected by, a GET /me that has nothing to do with them.
  if (to.meta.public) return

  const auth = useAuthStore()

  // Memoized on the store — the first navigation triggers the one and only
  // GET /me call; every navigation after that just awaits the same
  // already-resolved promise, so this never fires /me per route change.
  await auth.bootstrap()

  if (to.meta.requiresAuth && !auth.authenticated) {
    return { name: 'login' }
  }

  if (to.meta.guestOnly && auth.authenticated) {
    return { name: 'app-dashboard' }
  }

  if (to.meta.requiresAuth && auth.authenticated) {
    await useRestaurantStore().load()
    const { can, canAny, canOrganization } = usePermissions()
    // Operational kitchen accounts land directly in their working queue.
    if (to.name === 'app-dashboard' && !canAny(['view_operations', 'view_reports']) && can('update_kitchen_status')) {
      return { name: 'app-kitchen' }
    }
    if (to.name === 'app-settings' && !can('manage_restaurants') && !canOrganization('manage_organization')) {
      return { name: 'app-dashboard' }
    }
    if (to.name === 'app-service' && !canAny(['view_operations', 'create_orders', 'approve_customer_orders', 'serve_orders'])) {
      return { name: 'app-dashboard' }
    }
  }

  if (to.meta.permission) {
    // Restaurants (and with them, the auth-context-derived permissions) may
    // not be loaded yet on a cold navigation (direct URL / full refresh) —
    // load() is memoized the same way auth.bootstrap() is, so this never
    // triggers a duplicate GET /restaurants on a warm navigation. Without
    // this await, `can()` would read a not-yet-resolved currentRestaurantId
    // and fail closed on a user who actually has the permission.
    await useRestaurantStore().load()

    if (!usePermissions().can(to.meta.permission)) {
      return { name: 'app-dashboard' }
    }
  }
})

export default router
