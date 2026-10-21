import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { restaurantProductService } from '@/services/restaurant-product.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { RestaurantProduct } from '@/types/product'

/** Reads are scheduled by the screen's existing realtime/fallback scheduler. */
export function useProductAvailability(enabled: () => boolean, changed: () => void) {
  const restaurant = useRestaurantStore()
  const products = ref<RestaurantProduct[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const busy = reactive<Record<number, boolean>>({})
  const errors = reactive<Record<number, ApiError | null>>({})
  let generation = 0, revision = 0
  let controller: AbortController | null = null
  let pending: Promise<void> | null = null

  function refetch(): Promise<void> {
    if (pending) return pending
    const id = restaurant.currentRestaurantId, epoch = generation, version = revision
    if (!enabled() || id === null) return Promise.resolve()
    const request = new AbortController()
    controller = request
    loading.value = true
    pending = (async () => {
      try {
        const result = await restaurantProductService.list(id, request.signal)
        if (epoch === generation && version === revision && !request.signal.aborted) {
          products.value = result.filter(p => p.restaurant_id === id)
          error.value = null
        }
      } catch (err) {
        if (epoch === generation && !request.signal.aborted) error.value = normalizeApiError(err)
      } finally {
        if (epoch === generation) { loading.value = false; pending = null }
      }
    })()
    return pending
  }

  async function toggle(product: RestaurantProduct): Promise<void> {
    const id = restaurant.currentRestaurantId, epoch = generation
    if (!enabled() || busy[product.id] || product.restaurant_id !== id) return
    busy[product.id] = true
    errors[product.id] = null
    revision++ // An earlier read must not overwrite this mutation's response.
    try {
      const updated = await restaurantProductService.setAvailability(product.id, !product.available)
      if (epoch !== generation || updated.restaurant_id !== id || updated.id !== product.id) return
      revision++
      products.value = products.value.map(p => p.id === updated.id ? updated : p)
      changed()
    } catch (err) {
      if (epoch === generation) { errors[product.id] = normalizeApiError(err); changed() }
    } finally {
      if (epoch === generation) busy[product.id] = false
    }
  }

  watch(() => [restaurant.currentRestaurantId, enabled()] as const, () => {
    generation++; revision++
    controller?.abort(); pending = null
    products.value = []; loading.value = false; error.value = null
    for (const key of Object.keys(busy)) delete busy[Number(key)]
    for (const key of Object.keys(errors)) delete errors[Number(key)]
    void refetch()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { generation++; controller?.abort() })
  return { products, loading, error, busy, errors, refetch, toggle }
}
