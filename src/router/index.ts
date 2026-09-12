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
      path: '/app',
      component: () => import('@/layouts/AppShellLayout.vue'),
      redirect: { name: 'app-dashboard' },
      meta: { requiresAuth: true },
      children: [
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
          path: 'staff',
          name: 'app-staff',
          component: () => import('@/views/staff/StaffView.vue'),
          // Matches StaffPolicy exactly: every Staff ability is gated on
          // manage_users in the active organization — never a role name.
          meta: { permission: 'manage_users' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
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
