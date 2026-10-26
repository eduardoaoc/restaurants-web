import type { ReceivedRealtimeEvent } from '@/composables/useRestaurantRealtime'

/** Tracks newly visible order IDs without patching the server-owned queue. */
export function createKitchenRealtimeArrivals() {
  let knownIds = new Set<number>()
  let initialized = false
  let pendingCreatedEvent = false

  function reset(): void {
    knownIds = new Set()
    initialized = false
    pendingCreatedEvent = false
  }

  function noteEvent(event: ReceivedRealtimeEvent | null): void {
    pendingCreatedEvent = event?.name === 'order.created'
  }

  function observe(ids: readonly number[], source: string | null): number[] {
    const currentIds = new Set(ids)
    if (!initialized) {
      initialized = true
      knownIds = currentIds
      pendingCreatedEvent = false
      return []
    }
    const added = pendingCreatedEvent && source === 'event'
      ? [...currentIds].filter(id => !knownIds.has(id))
      : []
    if (source === 'event') pendingCreatedEvent = false
    knownIds = currentIds
    return added
  }

  return { reset, noteEvent, observe }
}
