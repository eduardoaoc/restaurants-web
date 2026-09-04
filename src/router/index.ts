import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
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
