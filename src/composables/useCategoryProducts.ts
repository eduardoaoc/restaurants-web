import { onBeforeUnmount, reactive, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { categoryProductService } from '@/services/category-product.service'
import { computeAdjacentSwap, nextSortOrder } from '@/utils/reorder'
import type { AttachCategoryProductPayload, CategoryProduct } from '@/types/category-product'
import type { Category } from '@/types/category'

/**
 * Products placed in EVERY category of the current Carta, fanned out in
 * parallel (CLAUDE.md Passo 2.6 §33) — same shape as
 * useProductModifierGroups's group→options fan-out (Passo 2.5), since the
 * backend has no bulk "products for these N categories" endpoint (confirmed
 * against CategoryProductController — only per-category `GET
 * /categories/{category}/products`). One GET per category, all in flight
 * together, never a sequential waterfall.
 *
 * Reacting to `categories()` (rather than watching the restaurant id
 * directly) is what makes restaurant switching, category creation/removal,
 * and the initial load all "just work" through the same code path: this
 * composable never needs to know WHY the category id list changed, only
 * that it did — stale categories are dropped and their in-flight requests
 * aborted, new ones are fetched (CLAUDE.md §34/§35).
 */
export function useCategoryProducts(categories: () => Category[], enabled: () => boolean = () => true) {
  const productsByCategory = reactive<Record<number, CategoryProduct[]>>({})
  const loadingByCategory = reactive<Record<number, boolean>>({})
  const errorByCategory = reactive<Record<number, ApiError | null>>({})

  const attachingByCategory = reactive<Record<number, boolean>>({})
  const attachErrorByCategory = reactive<Record<number, ApiError | null>>({})

  const reorderingByCategory = reactive<Record<number, boolean>>({})
  const reorderErrorByCategory = reactive<Record<number, ApiError | null>>({})

  // Keyed `${categoryId}:${restaurantProductId}` — a product can be mid-detach
  // in one category while perfectly idle in another (§7: the same
  // RestaurantProduct may sit in several categories at once).
  const detachingByKey = reactive<Record<string, boolean>>({})
  const detachErrorByCategory = reactive<Record<number, ApiError | null>>({})

  const controllers: Record<number, AbortController> = {}

  function detachKey(categoryId: number, restaurantProductId: number): string {
    return `${categoryId}:${restaurantProductId}`
  }

  function sortByOrder(list: CategoryProduct[]): CategoryProduct[] {
    return list.slice().sort((a, b) => a.sort_order - b.sort_order)
  }

  function abortController(categoryId: number): void {
    controllers[categoryId]?.abort()
    delete controllers[categoryId]
  }

  function dropCategory(categoryId: number): void {
    abortController(categoryId)
    delete productsByCategory[categoryId]
    delete loadingByCategory[categoryId]
    delete errorByCategory[categoryId]
  }

  async function fetchOne(categoryId: number): Promise<void> {
    abortController(categoryId)
    const localController = new AbortController()
    controllers[categoryId] = localController
    const { signal } = localController

    loadingByCategory[categoryId] = true
    errorByCategory[categoryId] = null

    try {
      const result = await categoryProductService.list(categoryId, signal)
      if (signal.aborted) return
      productsByCategory[categoryId] = sortByOrder(result)
    } catch (err) {
      if (signal.aborted) return
      errorByCategory[categoryId] = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loadingByCategory[categoryId] = false
    }
  }

  async function fetchAll(): Promise<void> {
    const currentIds = new Set(categories().map((c) => c.id))
    Object.keys(productsByCategory)
      .map(Number)
      .filter((id) => !currentIds.has(id))
      .forEach(dropCategory)

    await Promise.all(categories().map((category) => fetchOne(category.id)))
  }

  watch(
    () => [categories().map((c) => c.id).join(','), enabled()] as const,
    ([, isEnabled]) => {
      if (!isEnabled) {
        Object.keys(controllers).map(Number).forEach(dropCategory)
        return
      }
      void fetchAll()
    },
    { immediate: true },
  )

  async function attachProduct(categoryId: number, restaurantProductId: number): Promise<ApiError | null> {
    attachingByCategory[categoryId] = true
    attachErrorByCategory[categoryId] = null
    try {
      const existing = productsByCategory[categoryId] ?? []
      const payload: AttachCategoryProductPayload = {
        restaurant_product_id: restaurantProductId,
        sort_order: nextSortOrder(existing),
      }
      await categoryProductService.attach(categoryId, payload)
      // PENDÊNCIA BACKEND (Passo 2.6 report): unlike the list endpoint (which
      // eager-loads `restaurantProduct.product.translations`), the POST
      // response's `category_product.restaurant_product` comes back empty —
      // the model is never re-loaded with that relation before being
      // serialized. Rendering it as-is would show a bare "#<id>" placeholder
      // instead of the real name/price/availability, so a real re-fetch is
      // used here instead of trusting the raw POST body.
      await fetchOne(categoryId)
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      attachErrorByCategory[categoryId] = normalized
      return normalized
    } finally {
      attachingByCategory[categoryId] = false
    }
  }

  async function detachProduct(categoryId: number, restaurantProductId: number): Promise<ApiError | null> {
    const key = detachKey(categoryId, restaurantProductId)
    detachingByKey[key] = true
    detachErrorByCategory[categoryId] = null
    try {
      await categoryProductService.detach(categoryId, restaurantProductId)
      productsByCategory[categoryId] = (productsByCategory[categoryId] ?? []).filter(
        (cp) => cp.restaurant_product_id !== restaurantProductId,
      )
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      detachErrorByCategory[categoryId] = normalized
      return normalized
    } finally {
      detachingByKey[key] = false
    }
  }

  /**
   * Adjacent-swap reorder — the only safe primitive over a per-product-only
   * PATCH endpoint (PENDÊNCIA BACKEND — no bulk/atomic reorder exists here
   * either, same limitation already documented for Categories/Modifiers).
   * Exactly 2 PATCH calls per move. On ANY failure the local order is never
   * hand-corrected — a real re-fetch is the only trustworthy rollback.
   */
  async function moveProduct(categoryId: number, categoryProductId: number, direction: 'up' | 'down'): Promise<ApiError | null> {
    if (reorderingByCategory[categoryId]) return null

    const list = productsByCategory[categoryId] ?? []
    const swap = computeAdjacentSwap(list, categoryProductId, direction)
    if (!swap) return null

    reorderingByCategory[categoryId] = true
    reorderErrorByCategory[categoryId] = null
    productsByCategory[categoryId] = swap.reordered

    try {
      await categoryProductService.updateSortOrder(categoryId, swap.current.restaurant_product_id, {
        sort_order: swap.target.sort_order,
      })
      await categoryProductService.updateSortOrder(categoryId, swap.target.restaurant_product_id, {
        sort_order: swap.current.sort_order,
      })
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      reorderErrorByCategory[categoryId] = normalized
      await fetchOne(categoryId)
      return normalized
    } finally {
      reorderingByCategory[categoryId] = false
    }
  }

  function isDetaching(categoryId: number, restaurantProductId: number): boolean {
    return detachingByKey[detachKey(categoryId, restaurantProductId)] ?? false
  }

  onBeforeUnmount(() => {
    Object.keys(controllers).map(Number).forEach(abortController)
  })

  return {
    productsByCategory,
    loadingByCategory,
    errorByCategory,
    attachingByCategory,
    attachErrorByCategory,
    reorderingByCategory,
    reorderErrorByCategory,
    detachErrorByCategory,
    isDetaching,
    attachProduct,
    detachProduct,
    moveProduct,
  }
}
