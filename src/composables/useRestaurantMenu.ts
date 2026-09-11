import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { menuService } from '@/services/menu.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { CreateMenuPayload, Menu, UpdateMenuPayload } from '@/types/menu'

/**
 * Carta (Menu) for the current restaurant — same shape as
 * useRestaurantOperations: resolves the restaurant, fetches GET .../menu,
 * and re-fetches cleanly on every restaurant switch, aborting any in-flight
 * request for the previous restaurant so a slow response can never
 * overwrite the new restaurant's state (CLAUDE.md §22/§23 — no state leak,
 * no race condition on rapid A→B→C switching).
 *
 * A 404 here is a real, expected outcome (CLAUDE.md §29): "this restaurant
 * doesn't have a Carta yet" is onboarding, not an error, so it is tracked
 * separately as `notFound` and never lands in `error`.
 *
 * `enabled` (mirrors useRestaurantOperations/useRestaurantAnalytics): when
 * it returns false — the current restaurant's auth context doesn't grant
 * `manage_menu` — this never calls GET .../menu at all. The view is
 * expected to already be showing a forbidden message in that case.
 */
export function useRestaurantMenu(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()

  const menu = ref<Menu | null>(null)
  const loading = ref(false)
  const notFound = ref(false)
  const error = ref<ApiError | null>(null)

  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)

  let controller: AbortController | null = null

  async function fetch(restaurantId: number | null): Promise<void> {
    controller?.abort()
    menu.value = null
    notFound.value = false
    error.value = null

    if (restaurantId === null) return

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await menuService.get(restaurantId, signal)
      if (signal.aborted) return
      menu.value = result
    } catch (err) {
      if (signal.aborted) return
      const normalized = normalizeApiError(err)
      if (normalized.kind === 'not_found') {
        notFound.value = true
      } else {
        error.value = normalized
      }
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([id, isEnabled]) => {
      if (!isEnabled) {
        controller?.abort()
        menu.value = null
        notFound.value = false
        error.value = null
        loading.value = false
        return
      }
      void fetch(id)
    },
    { immediate: true },
  )

  /**
   * Returns the normalized error directly (null on success) rather than a
   * plain boolean — a caller that needs to make a synchronous decision right
   * after `await` (e.g. MenuHeaderCard closing its edit mode only on
   * success) can't rely on `saveError` having been reactively propagated
   * through props by then; the return value has no such timing gap.
   */
  async function createMenu(payload: CreateMenuPayload): Promise<ApiError | null> {
    const restaurantId = restaurantStore.currentRestaurantId
    if (restaurantId === null) return null

    saving.value = true
    saveError.value = null
    try {
      menu.value = await menuService.create(restaurantId, payload)
      notFound.value = false
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  async function updateMenu(payload: UpdateMenuPayload): Promise<ApiError | null> {
    const restaurantId = restaurantStore.currentRestaurantId
    if (restaurantId === null || menu.value === null) return null

    saving.value = true
    saveError.value = null
    try {
      menu.value = await menuService.update(restaurantId, payload)
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(() => controller?.abort())

  return { menu, loading, notFound, error, saving, saveError, createMenu, updateMenu }
}
