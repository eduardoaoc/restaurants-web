import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { restaurantsService } from '@/services/restaurants.service'
import type { Restaurant, RestaurantSettings } from '@/types/restaurant'

const PERSIST_KEY = 'aforo-restaurant-id'

/**
 * Multi-restaurant context — see CLAUDE.md §10: never assume
 * `user.restaurant` (singular). Accessible restaurants always come from
 * GET /api/v1/restaurants (backend is the authority on scope, see
 * RestaurantScope on the API side); `currentRestaurantId` is the only part
 * persisted client-side, and it is always revalidated against the loaded
 * list before being trusted — a stale/foreign id from a previous session
 * or a different account is discarded, never used as-is.
 */
export const useRestaurantStore = defineStore('restaurant', () => {
  const restaurants = ref<Restaurant[]>([])
  const currentRestaurantId = ref<number | null>(null)
  /** Best-effort — see loadCurrentSettings(). Not authoritative for anything the backend itself enforces. */
  const currentSettings = ref<RestaurantSettings | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const currentRestaurant = computed<Restaurant | null>(
    () => restaurants.value.find((restaurant) => restaurant.id === currentRestaurantId.value) ?? null,
  )

  let loadPromise: Promise<void> | null = null

  /**
   * Memoized the same way auth.bootstrap() is: the App Shell and any
   * screen needing restaurant context can all call this on mount without
   * triggering a duplicate GET /restaurants.
   */
  function load(): Promise<void> {
    if (!loadPromise) {
      loadPromise = fetchRestaurants()
    }
    return loadPromise
  }

  async function fetchRestaurants(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      restaurants.value = await restaurantsService.list()
      resolveCurrentRestaurant()
      await loadCurrentSettings()
    } catch (err) {
      error.value = normalizeApiError(err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Validate → reuse → discard → select, per CLAUDE.md §6: a persisted id
   * is only ever reused after confirming it's still in the freshly loaded
   * list; otherwise it's dropped and the first accessible restaurant wins.
   */
  function resolveCurrentRestaurant(): void {
    const persisted = readPersistedId()
    const stillAccessible = persisted !== null && restaurants.value.some((r) => r.id === persisted)

    currentRestaurantId.value = stillAccessible ? persisted : (restaurants.value[0]?.id ?? null)
    persistId(currentRestaurantId.value)
  }

  async function selectRestaurant(id: number): Promise<void> {
    if (currentRestaurantId.value === id) return
    if (!restaurants.value.some((r) => r.id === id)) return

    currentRestaurantId.value = id
    persistId(id)
    await loadCurrentSettings()
  }

  /**
   * GET /restaurants/{id}/settings requires `manage_restaurants` — a
   * view_reports-only user (can see the Dashboard) may get 403 here. That
   * is expected, not an error to surface: the Dashboard still works using
   * the platform defaults (src/utils/format.ts) when this is unavailable.
   */
  async function loadCurrentSettings(): Promise<void> {
    currentSettings.value = null
    if (currentRestaurantId.value === null) return

    try {
      currentSettings.value = await restaurantsService.settings(currentRestaurantId.value)
    } catch {
      currentSettings.value = null
    }
  }

  function clearRestaurant(): void {
    restaurants.value = []
    currentRestaurantId.value = null
    currentSettings.value = null
    error.value = null
    loadPromise = null
    persistId(null)
  }

  function readPersistedId(): number | null {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      return raw === null ? null : Number(raw)
    } catch {
      return null
    }
  }

  function persistId(id: number | null): void {
    try {
      if (id === null) localStorage.removeItem(PERSIST_KEY)
      else localStorage.setItem(PERSIST_KEY, String(id))
    } catch {
      // localStorage unavailable — persistence is a convenience, not a requirement.
    }
  }

  return {
    restaurants,
    currentRestaurantId,
    currentRestaurant,
    currentSettings,
    loading,
    error,
    load,
    selectRestaurant,
    clearRestaurant,
  }
})
