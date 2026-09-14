import { onBeforeUnmount, reactive, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { ordersService } from '@/services/orders.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { Order } from '@/types/orders'

/**
 * Orders `waiting_approval` for the CURRENT restaurant (Passo 3.2 §8) —
 * same fetch-on-mount/restaurant-switch/abort shape as every other
 * restaurant-scoped composable in this app (useRestaurantOperations,
 * useRestaurantCategories, ...). `restaurant_id` is always sent explicitly
 * (never omitted) so an Owner with several restaurants never sees another
 * restaurant's pending orders bleed into this one (CLAUDE.md's restaurant-
 * scoping discipline).
 *
 * `approve`/`reject` are per-order actions with their OWN pending/error
 * state (keyed by order id) rather than one shared boolean — two different
 * orders can be approved/rejected independently without one action's
 * spinner freezing the other's button (Passo 3.2 §23 concurrency). A 409
 * (another waiter already acted on it, or the order's status moved on)
 * always triggers a refetch of the list — the backend's current state wins,
 * never a locally-guessed one.
 */
export function useOrderApprovals(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()

  const orders = ref<Order[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const actingOn = reactive<Record<number, 'approve' | 'reject' | undefined>>({})
  const actionError = reactive<Record<number, ApiError | null>>({})

  let controller: AbortController | null = null

  async function fetch(restaurantId: number | null): Promise<void> {
    controller?.abort()
    error.value = null

    if (restaurantId === null || !enabled()) {
      orders.value = []
      loading.value = false
      return
    }

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await ordersService.list({ restaurant_id: restaurantId, status: 'waiting_approval' }, signal)
      if (signal.aborted) return
      orders.value = result
    } catch (err) {
      if (signal.aborted) return
      orders.value = []
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function refetch(): void {
    void fetch(restaurantStore.currentRestaurantId)
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([id]) => void fetch(id),
    { immediate: true },
  )

  async function act(orderId: number, action: 'approve' | 'reject'): Promise<ApiError | null> {
    actingOn[orderId] = action
    actionError[orderId] = null
    try {
      await (action === 'approve' ? ordersService.approve(orderId) : ordersService.reject(orderId))
      // Authoritative response applied by simply dropping the order from
      // this waiting_approval-only list — it just moved to a different
      // status, never something this list re-derives locally.
      orders.value = orders.value.filter((o) => o.id !== orderId)
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      actionError[orderId] = normalized
      // A conflict (already acted on by someone else, or status moved) or
      // a stale not-found both mean this list's current copy is wrong —
      // refetch rather than trust anything local (§23).
      if (normalized.kind === 'conflict' || normalized.kind === 'not_found') refetch()
      return normalized
    } finally {
      actingOn[orderId] = undefined
    }
  }

  function approve(orderId: number): Promise<ApiError | null> {
    return act(orderId, 'approve')
  }

  function reject(orderId: number): Promise<ApiError | null> {
    return act(orderId, 'reject')
  }

  onBeforeUnmount(() => controller?.abort())

  return { orders, loading, error, actingOn, actionError, approve, reject, refetch }
}
