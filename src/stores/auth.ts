import { computed, ref } from 'vue'
import { normalizeApiError } from '@/api/errors'
import { defineStore } from 'pinia'

import { disconnectEcho } from '@/realtime/echo'
import { authService } from '@/services/auth.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { AuthenticatedUser, LoginPayload } from '@/types/auth'
import type { AuthContext } from '@/types/auth-context'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthenticatedUser | null>(null)
  const initializing = ref(true)
  const submitting = ref(false)
  const unavailable = ref(false)
  const notice = ref<'sessionExpired' | 'logoutIncomplete' | null>(null)
  /**
   * Full authorization context (organizations/restaurants/permissions +
   * platform access) from GET /auth/context — see
   * src/composables/usePermissions.ts for how this is turned into
   * can()/canOrganization()/canPlatform(). null means "not loaded yet, or
   * the last fetch failed" — every permission check must read that as "no",
   * never as "unknown, assume yes" (CLAUDE.md fail-closed rule).
   */
  const authContext = ref<AuthContext | null>(null)
  const authContextLoading = ref(false)

  const authenticated = computed(() => user.value !== null)

  const sessionGeneration = ref(0)
  let contextGeneration = 0

  let bootstrapPromise: Promise<void> | null = null

  /**
   * Resolves whether a session already exists (e.g. after F5) by calling
   * GET /me exactly once, however many callers await it concurrently — the
   * router guard and App.vue's bootstrap screen both call this, and neither
   * should trigger its own network round trip.
   */
  function bootstrap(): Promise<void> {
    if (!bootstrapPromise) {
      bootstrapPromise = fetchUser().finally(() => {
        initializing.value = false
      })
    }

    return bootstrapPromise
  }

  function clearSession(): void {
    ++sessionGeneration.value
    authContextLoading.value = false
    user.value = null
    authContext.value = null
    useRestaurantStore().clearRestaurant()
    disconnectEcho()
  }
  function expireSession(): void {
    if (!authenticated.value) return
    clearSession()
    notice.value = 'sessionExpired'
  }
  async function retryBootstrap(): Promise<void> {
    if (initializing.value) return
    bootstrapPromise = null
    initializing.value = true
    await bootstrap()
  }
  async function fetchUser(): Promise<void> {
    unavailable.value = false
    const generation = sessionGeneration.value
    try {
      const result = await authService.me()
      if (generation !== sessionGeneration.value) return
      user.value = result
    } catch (error) {
      if (generation !== sessionGeneration.value) return
      const status = normalizeApiError(error).status
      if (status === 401 || status === 419) clearSession()
      else unavailable.value = true
      return
    }

    // Identity confirmed — now resolve what this session is allowed to do.
    // fetchAuthContext() never throws (it fails closed to null on its own),
    // so this never turns a successful /me into a failed bootstrap.
    await fetchAuthContext()
  }

  /**
   * GET /auth/context — always fetched right after identity is confirmed
   * (bootstrap or login), never polled. A failure here fails closed
   * (authContext stays/becomes null, so every can()/canOrganization()/
   * canPlatform() call returns false) rather than throwing and breaking
   * the surrounding flow — a permission-context hiccup must never prevent
   * an otherwise-valid session from reaching the app.
   */
  async function fetchAuthContext(): Promise<void> {
    const generation = sessionGeneration.value
    const token = ++contextGeneration
    const current = () => generation === sessionGeneration.value && token === contextGeneration
    authContext.value = null
    authContextLoading.value = true
    try {
      const result = await authService.context()
      if (current()) authContext.value = result
    } catch {
      if (current()) authContext.value = null
    } finally {
      if (current()) authContextLoading.value = false
    }
  }

  /**
   * Exposed for call sites that need to force a fresh context outside the
   * normal login/bootstrap lifecycle (e.g. after a 403 that suggests the
   * cached context is stale — see CLAUDE.md §30). Never called on a timer.
   */
  function refreshAuthContext(): Promise<void> {
    return fetchAuthContext()
  }

  async function login(payload: LoginPayload): Promise<void> {
    if (submitting.value) return
    const generation = ++sessionGeneration.value
    submitting.value = true
    try {
      notice.value = null
      await authService.csrf()
      if (generation !== sessionGeneration.value) return
      const result = await authService.login(payload)
      if (generation !== sessionGeneration.value) return
      user.value = result
      await fetchAuthContext()
    } finally {
      submitting.value = false
    }
  }

  const switchingOrganization = ref(false)

  /**
   * Makes another organization (one the user actively belongs to — the
   * backend refuses anything else) the session's active organization, then
   * drops every restaurant-scoped piece of client state before reloading
   * context + restaurants, so nothing from the previous organization
   * survives the switch.
   */
  async function switchOrganization(organizationId: number): Promise<void> {
    if (switchingOrganization.value || authContext.value?.active_organization_id === organizationId) return
    switchingOrganization.value = true
    try {
      await authService.selectOrganization(organizationId)
      const restaurantStore = useRestaurantStore()
      restaurantStore.clearRestaurant()
      disconnectEcho()
      await fetchAuthContext()
      await restaurantStore.load()
    } finally {
      switchingOrganization.value = false
    }
  }

  /**
   * After accepting an invitation the backend has signed this browser in
   * (possibly as a different account) and chosen the invited organization:
   * reset everything client-side and resolve identity + context again.
   */
  async function adoptAcceptedSession(): Promise<void> {
    clearSession()
    notice.value = null
    await fetchUser()
  }

  async function logout(): Promise<void> {
    notice.value = null
    clearSession()
    const generation = sessionGeneration.value
    try { await authService.logout() }
    catch { if (generation === sessionGeneration.value) notice.value = 'logoutIncomplete' }
  }

  return {
    sessionGeneration,
    unavailable,
    notice,
    retryBootstrap,
    expireSession,
    user,
    initializing,
    submitting,
    authContext,
    authContextLoading,
    authenticated,
    bootstrap,
    fetchUser,
    refreshAuthContext,
    login,
    logout,
    switchingOrganization,
    switchOrganization,
    adoptAcceptedSession,
  }
})
