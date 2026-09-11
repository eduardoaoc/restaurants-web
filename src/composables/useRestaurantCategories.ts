import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { categoryService } from '@/services/category.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { Category, CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'

/**
 * Categories of the current restaurant's Carta — same shape as
 * useRestaurantMenu/useRestaurantOperations: fetches on mount and on every
 * restaurant switch, aborting any in-flight request for the previous
 * restaurant (CLAUDE.md Passo 2.3 §20/§17 — no stale category from A ever
 * appears while B is loading or after).
 *
 * `enabled` gates the fetch on BOTH `manage_menu` and "the Carta actually
 * exists yet" (categories are meaningless before a Menu exists) — the
 * caller (CategoryList, driven by MenuView) computes this the same way
 * DashboardView gates useRestaurantOperations on `view_operations`.
 */
export function useRestaurantCategories(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()

  const categories = ref<Category[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)

  const reordering = ref(false)
  const reorderError = ref<ApiError | null>(null)

  let controller: AbortController | null = null

  function sortByOrder(list: Category[]): Category[] {
    return list.slice().sort((a, b) => a.sort_order - b.sort_order)
  }

  async function fetch(restaurantId: number | null): Promise<void> {
    controller?.abort()
    categories.value = []
    error.value = null

    if (restaurantId === null) return

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await categoryService.list(restaurantId, signal)
      if (signal.aborted) return
      categories.value = sortByOrder(result)
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([id, isEnabled]) => {
      if (!isEnabled) {
        controller?.abort()
        categories.value = []
        error.value = null
        loading.value = false
        return
      }
      void fetch(id)
    },
    { immediate: true },
  )

  /** Newly created categories default to sort_order 0 on the backend if omitted (CreateCategoryAction) — every category without an explicit order would collide at 0, so this always appends past the current max. */
  function nextSortOrder(): number {
    return categories.value.reduce((max, category) => Math.max(max, category.sort_order), -1) + 1
  }

  async function createCategory(payload: CreateCategoryPayload): Promise<ApiError | null> {
    const restaurantId = restaurantStore.currentRestaurantId
    if (restaurantId === null) return null

    saving.value = true
    saveError.value = null
    try {
      const created = await categoryService.create(restaurantId, {
        ...payload,
        sort_order: payload.sort_order ?? nextSortOrder(),
      })
      categories.value = sortByOrder([...categories.value, created])
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  async function updateCategory(categoryId: number, payload: UpdateCategoryPayload): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      const updated = await categoryService.update(categoryId, payload)
      categories.value = sortByOrder(categories.value.map((c) => (c.id === categoryId ? updated : c)))
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  /**
   * Adjacent-swap reorder — the only safe primitive over a per-category-only
   * PATCH endpoint (PENDÊNCIA BACKEND — no bulk/atomic reorder exists, see
   * report). Exactly 2 PATCH calls per move, regardless of list size, so
   * "only send categories whose sort_order actually changed" (CLAUDE.md
   * §14) holds by construction.
   *
   * Applies the swap to local state immediately for instant feedback, then
   * confirms with the backend. On ANY failure the local order is never
   * hand-corrected — the only trustworthy rollback is a real re-fetch, so
   * one is triggered and the visible order becomes "whatever the backend
   * actually has" again (CLAUDE.md §24: consistency over a clever partial
   * rollback).
   */
  async function move(categoryId: number, direction: 'up' | 'down'): Promise<ApiError | null> {
    if (reordering.value) return null

    const index = categories.value.findIndex((c) => c.id === categoryId)
    if (index === -1) return null

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= categories.value.length) return null

    const current = categories.value[index]
    const target = categories.value[targetIndex]
    const currentOrder = current.sort_order
    const targetOrder = target.sort_order

    reordering.value = true
    reorderError.value = null

    const optimistic = categories.value.slice()
    optimistic[index] = { ...current, sort_order: targetOrder }
    optimistic[targetIndex] = { ...target, sort_order: currentOrder }
    categories.value = sortByOrder(optimistic)

    try {
      await categoryService.update(current.id, { sort_order: targetOrder })
      await categoryService.update(target.id, { sort_order: currentOrder })
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      reorderError.value = normalized
      await fetch(restaurantStore.currentRestaurantId)
      return normalized
    } finally {
      reordering.value = false
    }
  }

  onBeforeUnmount(() => controller?.abort())

  return {
    categories,
    loading,
    error,
    saving,
    saveError,
    reordering,
    reorderError,
    createCategory,
    updateCategory,
    move,
  }
}
