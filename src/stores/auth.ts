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
    try {
      user.value = await authService.me()
    } catch (error) {
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
    authContextLoading.value = true
    try {
      authContext.value = await authService.context()
    } catch {
      authContext.value = null
    } finally {
      authContextLoading.value = false
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
    submitting.value = true
    try {
      notice.value = null
      await authService.csrf()
      user.value = await authService.login(payload)
      await fetchAuthContext()
    } finally {
      submitting.value = false
    }
  }

  async function logout(): Promise<void> {
    notice.value = null
    try { await authService.logout() }
    catch { notice.value = 'logoutIncomplete' }
    finally { clearSession() }
  }

  return {
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
  }
})
