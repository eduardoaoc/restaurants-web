import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authService } from '@/services/auth.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { AuthenticatedUser, LoginPayload } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthenticatedUser | null>(null)
  const initializing = ref(true)
  const submitting = ref(false)

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

  async function fetchUser(): Promise<void> {
    try {
      user.value = await authService.me()
    } catch {
      // No session (guest) or an expired one — both are expected outcomes
      // of a bootstrap check, not application errors.
      user.value = null
    }
  }

  async function login(payload: LoginPayload): Promise<void> {
    submitting.value = true
    try {
      await authService.csrf()
      user.value = await authService.login(payload)
    } finally {
      submitting.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await authService.logout()
    } finally {
      user.value = null
      useRestaurantStore().clearRestaurant()
    }
  }

  return {
    user,
    initializing,
    submitting,
    authenticated,
    bootstrap,
    fetchUser,
    login,
    logout,
  }
})
