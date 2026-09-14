import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { kitchenService } from '@/services/kitchen.service'
import { KITCHEN_ACTIONS, type KitchenOrder } from '@/types/kitchen'

export function useKitchenOrders(restaurantId: () => number | null, enabled: () => boolean) {
  const orders = ref<KitchenOrder[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const actionError = ref<ApiError | null>(null)
  const actingOn = reactive<Record<number, boolean>>({})
  const receivedAt = ref(Date.now())
  let generation = 0
  let controller: AbortController | null = null

  async function refetch(): Promise<void> {
    controller?.abort()
    const id = restaurantId()
    if (id === null || !enabled()) return
    const request = new AbortController()
    controller = request
    loading.value = true
    error.value = null
    try {
      const result = await kitchenService.list(id, request.signal)
      if (request.signal.aborted) return
      orders.value = result.filter(order => order.restaurant.id === id)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)
      receivedAt.value = Date.now()
    } catch (err) {
      if (request.signal.aborted) return
      error.value = normalizeApiError(err)
      // Permission loss must immediately remove previously visible data.
      if (['forbidden', 'unauthenticated', 'not_found'].includes(error.value.kind)) orders.value = []
    } finally {
      if (!request.signal.aborted) loading.value = false
    }
  }

  watch(() => [restaurantId(), enabled()] as const, () => {
    generation++
    controller?.abort()
    orders.value = []
    error.value = null
    actionError.value = null
    loading.value = false
    for (const key of Object.keys(actingOn)) delete actingOn[Number(key)]
    void refetch()
  }, { immediate: true, flush: 'sync' })

  async function advance(order: KitchenOrder): Promise<void> {
    const action = KITCHEN_ACTIONS[order.status]
    if (!action || !enabled() || actingOn[order.id] || error.value || order.restaurant.id !== restaurantId()) return
    const epoch = generation
    actingOn[order.id] = true
    actionError.value = null
    try {
      await kitchenService.transition(order.id, action)
    } catch (err) {
      if (epoch === generation) actionError.value = normalizeApiError(err)
    } finally {
      if (epoch === generation) {
        // Includes 409/422/404 and ambiguous network failures. No optimistic
        // status, retries or writes over another cook's authoritative state.
        await refetch()
        if (epoch === generation) delete actingOn[order.id]
      }
    }
  }

  onBeforeUnmount(() => { generation++; controller?.abort() })
  return { orders, loading, error, actionError, actingOn, receivedAt, refetch, advance }
}
