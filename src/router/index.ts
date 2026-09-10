import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import type { PermissionSlug } from '@/types/auth-context'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    /**
     * Restaurant-scoped capability a route requires (Passo 1.2C). Not set
     * on any route yet — Dashboard is still the app's only authenticated
     * destination and handles its own permission-aware rendering
     * internally (see DashboardView), so there is nowhere sensible to
     * redirect a denied user to yet. This is here so the next
     * permission-gated route (Mesas/Staff/Settings/...) is a one-line
     * `meta: { permission: '...' }` addition, not a new mechanism.
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
})

export default router
