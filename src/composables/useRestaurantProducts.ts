import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { productService } from '@/services/product.service'
import { restaurantProductService } from '@/services/restaurant-product.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type {
  AttachRestaurantProductPayload,
  CreateProductPayload,
  Product,
  RestaurantProduct,
  UpdateProductPayload,
  UpdateRestaurantProductPayload,
} from '@/types/product'

/**
 * Products of the current restaurant's Carta, plus (lazily) the
 * organization-wide catalog used by the "reuse an existing product" flow —
 * same shape as useRestaurantCategories: fetch on mount and on every
 * restaurant switch, abort the previous restaurant's in-flight request
 * (CLAUDE.md Passo 2.4 §29 — no product from A ever appears while B is
 * loading or after).
 *
 * `enabled` gates the fetch on `manage_products` (a restaurant-scoped
 * capability distinct from `manage_menu` — CLAUDE.md §30) AND "the Carta
 * actually exists" — computed by the caller (ProductList, driven by
 * MenuView), same pattern as useRestaurantCategories.
 */
export function useRestaurantProducts(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()
  const { currentOrganizationContext } = usePermissions()

  const restaurantProducts = ref<RestaurantProduct[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  // Org-wide catalog — loaded on demand (only when the "reuse existing"
  // picker actually opens, never eagerly just for visiting the tab) and
  // cached per organization id. A restaurant switch that stays within the
  // same organization reuses it; crossing into a different organization
  // invalidates it (CLAUDE.md §29).
  const catalog = ref<Product[]>([])
  const catalogLoading = ref(false)
  const catalogError = ref<ApiError | null>(null)
  const catalogLoadedForOrgId = ref<number | null>(null)

  // Two-phase create-new-product state: creating the catalog Product and
  // attaching it to the restaurant are two independent HTTP calls with no
  // backend transaction linking them (CLAUDE.md §10/§33). `pendingProduct`
  // holds a successfully-created Product whose attach hasn't succeeded
  // yet, so a retry calls ONLY attachProduct again — never re-creates.
  const pendingProduct = ref<Product | null>(null)
  const creating = ref(false)
  const createError = ref<ApiError | null>(null)
  const attaching = ref(false)
  const attachError = ref<ApiError | null>(null)

  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)

  let controller: AbortController | null = null
  let catalogController: AbortController | null = null

  async function fetch(restaurantId: number | null): Promise<void> {
    controller?.abort()
    restaurantProducts.value = []
    error.value = null

    if (restaurantId === null) return

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await restaurantProductService.list(restaurantId, signal)
      if (signal.aborted) return
      restaurantProducts.value = result
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
        restaurantProducts.value = []
        error.value = null
        loading.value = false
        return
      }
      void fetch(id)
    },
    { immediate: true },
  )

  async function loadCatalog(force = false): Promise<void> {
    const orgId = currentOrganizationContext.value?.id ?? null

    if (!force && orgId !== null && catalogLoadedForOrgId.value === orgId) return

    catalogController?.abort()
    catalogError.value = null

    if (orgId === null) {
      catalog.value = []
      catalogLoadedForOrgId.value = null
      return
    }

    catalogController = new AbortController()
    const { signal } = catalogController
    catalogLoading.value = true

    try {
      const result = await productService.list(signal)
      if (signal.aborted) return
      catalog.value = result
      catalogLoadedForOrgId.value = orgId
    } catch (err) {
      if (signal.aborted) return
      catalogError.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) catalogLoading.value = false
    }
  }

  async function createProduct(payload: CreateProductPayload): Promise<ApiError | null> {
    creating.value = true
    createError.value = null
    try {
      const product = await productService.create(payload)
      pendingProduct.value = product
      if (catalogLoadedForOrgId.value !== null) {
        catalog.value = [...catalog.value, product]
      }
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      createError.value = normalized
      return normalized
    } finally {
      creating.value = false
    }
  }

  async function attachProduct(
    productId: number,
    payload: Omit<AttachRestaurantProductPayload, 'product_id'>,
  ): Promise<ApiError | null> {
    const restaurantId = restaurantStore.currentRestaurantId
    if (restaurantId === null) return null

    attaching.value = true
    attachError.value = null
    try {
      const attached = await restaurantProductService.attach(restaurantId, { product_id: productId, ...payload })
      restaurantProducts.value = [...restaurantProducts.value, attached]
      pendingProduct.value = null
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      attachError.value = normalized
      return normalized
    } finally {
      attaching.value = false
    }
  }

  function resetAddState(): void {
    pendingProduct.value = null
    createError.value = null
    attachError.value = null
  }

  /**
   * Edit flow: Product-level fields (translations/internal_name/sku/status)
   * and RestaurantProduct-level fields (price/available) are two separate
   * PATCH calls (CLAUDE.md §19/§20) but both are idempotent — a caller that
   * retries after a partial failure can safely re-send both without
   * duplicating or corrupting anything, unlike create+attach above.
   */
  async function updateProduct(productId: number, payload: UpdateProductPayload): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      const updated = await productService.update(productId, payload)
      restaurantProducts.value = restaurantProducts.value.map((rp) =>
        rp.product_id === productId ? { ...rp, product: updated } : rp,
      )
      if (catalogLoadedForOrgId.value !== null) {
        catalog.value = catalog.value.map((p) => (p.id === productId ? updated : p))
      }
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  async function updateRestaurantProduct(
    restaurantProductId: number,
    payload: UpdateRestaurantProductPayload,
  ): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      const updated = await restaurantProductService.update(restaurantProductId, payload)
      restaurantProducts.value = restaurantProducts.value.map((rp) => (rp.id === restaurantProductId ? updated : rp))
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(() => {
    controller?.abort()
    catalogController?.abort()
  })

  return {
    restaurantProducts,
    loading,
    error,
    catalog,
    catalogLoading,
    catalogError,
    loadCatalog,
    pendingProduct,
    creating,
    createError,
    attaching,
    attachError,
    createProduct,
    attachProduct,
    resetAddState,
    saving,
    saveError,
    updateProduct,
    updateRestaurantProduct,
  }
}
