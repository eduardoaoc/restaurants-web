import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { ordersService } from '@/services/orders.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { Order } from '@/types/orders'
import { isPendingCustomerOrder } from '@/utils/order-approval'

type ApprovalAction = 'approve' | 'reject'
// Servicio and the table drawer can show the same order simultaneously.
// Keep their mutation lock shared; release it even if its initiator unmounts.
const pendingActions = reactive(new Map<number, { restaurantId: number; action: ApprovalAction }>())
// Uncertainty must also survive switching surfaces or unmounting its initiator.
const needsReconciliation = new Set<number>()

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
export function useOrderApprovals(
  enabled: () => boolean = () => true,
  onUpdated?: (order: Order) => void,
  context: () => number | null = () => null,
) {
  const restaurantStore = useRestaurantStore()

  const orders = ref<Order[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const actingOn = computed<Record<number, ApprovalAction | undefined>>(() => Object.fromEntries(
    [...pendingActions].filter(([, pending]) => pending.restaurantId === restaurantStore.currentRestaurantId)
      .map(([id, pending]) => [id, pending.action]),
  ))
  const actionError = reactive<Record<number, ApiError | null>>({})

  let controller: AbortController | null = null
  let scopeGeneration = 0
  let disposed = false
  const settledOrders = new Set<number>()

  function canAct(order: Order): boolean {
    return enabled() && !settledOrders.has(order.id)
      && isPendingCustomerOrder(order, restaurantStore.currentRestaurantId)
  }

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
      orders.value = result.filter((order) => canAct(order) && order.restaurant.id === restaurantId)
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function refetch(): Promise<void> {
    return fetch(restaurantStore.currentRestaurantId)
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled(), context()] as const,
    ([id]) => {
      ++scopeGeneration
      orders.value = []
      settledOrders.clear()
      for (const key of Object.keys(actionError)) delete actionError[Number(key)]
      void fetch(id)
    },
    { immediate: true, flush: 'sync' },
  )

  function applyOrder(updated: Order): void {
    controller?.abort()
    loading.value = false
    if (!isPendingCustomerOrder(updated, restaurantStore.currentRestaurantId)) settledOrders.add(updated.id)
    orders.value = orders.value.flatMap((candidate) => candidate.id === updated.id
      ? (canAct(updated) ? [updated] : []) : [candidate])
    onUpdated?.(updated)
  }

  async function act(target: number | Order, action: ApprovalAction): Promise<ApiError | null> {
    // A table detail already has an authoritative order snapshot; it must
    // not depend on a second queue GET succeeding before it can act.
    const order = typeof target === 'number' ? orders.value.find((candidate) => candidate.id === target) : target
    if (disposed || !order || !canAct(order) || pendingActions.has(order.id)) return { kind: 'conflict' }
    const orderId = order.id
    const generation = scopeGeneration
    const current = () => !disposed && generation === scopeGeneration && enabled()
    pendingActions.set(orderId, { restaurantId: order.restaurant.id, action })
    actionError[orderId] = null
    try {
      // A lost POST response does not tell us whether the transaction committed.
      // If its follow-up read also failed, every retry must read before writing.
      if (needsReconciliation.has(orderId)) {
        const authoritative = await ordersService.get(orderId)
        if (!current()) return { kind: 'conflict' }
        needsReconciliation.delete(orderId)
        applyOrder(authoritative)
        if (!canAct(authoritative)) { await refetch(); return null }
      }
      const updated = await (action === 'approve' ? ordersService.approve(orderId) : ordersService.reject(orderId))
      if (!current()) return { kind: 'conflict' }
      // Invalidate a GET begun before this mutation completed: a late stale
      // snapshot must never put the approved order back into the queue.
      applyOrder(updated)
      await refetch()
      if (!current()) return { kind: 'conflict' }
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      if (!current()) return normalized
      actionError[orderId] = normalized
      if (normalized.kind === 'network' || normalized.kind === 'server') {
        needsReconciliation.add(orderId)
        try {
          const authoritative = await ordersService.get(orderId)
          if (!current()) return normalized
          needsReconciliation.delete(orderId)
          applyOrder(authoritative)
          await refetch()
        } catch {
          // Keep the uncertainty marker: another POST requires a successful GET.
        }
      }
      // A conflict (already acted on by someone else, or status moved) or
      // a stale not-found both mean this list's current copy is wrong —
      // refetch rather than trust anything local (§23).
      if (normalized.kind === 'conflict' || normalized.kind === 'not_found') await refetch()
      return normalized
    } finally {
      pendingActions.delete(orderId)
    }
  }

  function approve(order: number | Order): Promise<ApiError | null> {
    return act(order, 'approve')
  }

  function reject(order: number | Order): Promise<ApiError | null> {
    return act(order, 'reject')
  }

  onBeforeUnmount(() => {
    disposed = true
    ++scopeGeneration
    controller?.abort()
  })

  return { orders, loading, error, get actingOn() { return actingOn.value }, actionError, canAct, approve, reject, refetch }
}
