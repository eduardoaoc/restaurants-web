import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'

export interface OrderHistoryPage<T> {
  orders: T[]
  nextBeforeId: number | null
}

/** One paginated read at a time; a context generation also protects A→B→A. */
export function useSessionOrderHistory<T extends { id: number }>(
  context: () => string | null,
  fetchPage: (beforeId: number | null, signal: AbortSignal) => Promise<OrderHistoryPage<T>>,
) {
  const orders = shallowRef<T[] | null>(null)
  const error = ref<ApiError | null>(null)
  const loading = ref(false)
  const nextBeforeId = ref<number | null>(null)
  let disposed = false
  let retryAt = 0
  let denied = false
  let generation = 0
  let depth = 1
  let controller: AbortController | null = null
  let pending: Promise<void> | null = null

  function load(more = false): Promise<void> {
    if (disposed || !context() || denied || Date.now() < retryAt) return Promise.resolve()
    if (pending) return pending
    if (more && nextBeforeId.value === null) return Promise.resolve()
    const request = new AbortController()
    controller = request
    const epoch = generation
    const current = () => epoch === generation && !request.signal.aborted
    loading.value = true
    error.value = null
    const pages = more ? 1 : depth
    const task = (async () => {
      try {
        let cursor = more ? nextBeforeId.value : null
        const rows: T[] = more ? [...(orders.value ?? [])] : []
        for (let page = 0; page < pages; page++) {
          const result = await fetchPage(cursor, request.signal)
          if (!current()) return
          rows.push(...result.orders)
          const previous = cursor
          cursor = result.nextBeforeId
          if (cursor === null || cursor === previous) { cursor = null; break }
        }
        if (!current()) return
        orders.value = [...new Map(rows.map(order => [order.id, order])).values()]
        nextBeforeId.value = cursor
        if (more) depth++
      } catch (err) {
        if (current()) {
          const failure = normalizeApiError(err)
          error.value = failure
          retryAt = Date.now() + (failure.retryAfterSeconds ?? 0) * 1000
          denied = ['forbidden', 'unauthenticated', 'not_found'].includes(failure.kind) || failure.code === 'PUBLIC_VISIT_INVALID'
        }
      } finally {
        if (current()) { loading.value = false; pending = null }
      }
    })()
    pending = task
    return task
  }

  watch(context, () => {
    generation++
    controller?.abort()
    pending = null
    depth = 1
    retryAt = 0
    denied = false
    orders.value = null
    nextBeforeId.value = null
    error.value = null
    loading.value = false
    if (context()) void load()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { disposed = true; generation++; controller?.abort() })

  function cancelPending(): void {
    generation++
    controller?.abort()
    pending = null
    loading.value = false
  }
  return { orders, error, loading, nextBeforeId, cancelPending, refresh: () => load(), loadMore: () => load(true) }
}
