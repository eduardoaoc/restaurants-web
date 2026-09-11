import { onBeforeUnmount, ref, watch } from 'vue'
import type { Channel } from 'laravel-echo'

import { getEcho } from '@/realtime/echo'
import {
  EVENTS_REQUIRING_OPERATIONS_REFRESH,
  REALTIME_EVENT_NAMES,
  type RealtimeConnectionState,
  type RealtimeEventEnvelope,
  type RealtimeEventName,
} from '@/types/realtime'

const REFRESH_DEBOUNCE_MS = 250

export interface ReceivedRealtimeEvent extends RealtimeEventEnvelope {
  name: RealtimeEventName
}

/**
 * Reads pusher-js's own raw connection state directly — NOT
 * laravel-echo's `connectionStatus()`/`onConnectionChange()` wrapper,
 * which collapses `unavailable` (a temporary drop pusher-js is already
 * retrying with its own backoff) into the same bucket as `failed` (a
 * genuinely terminal state, e.g. no supported transport at all).
 * Verified live (Passo 1.3 §40 reconnection test): killing Reverb put the
 * raw connection in `unavailable` for ~20-25s while pusher-js retried on
 * its own, then it recovered to `connected` with zero app-level
 * intervention — collapsing that window into "error" would tell the user
 * something is broken when it's actually just reconnecting.
 */
function mapPusherState(state: string): RealtimeConnectionState {
  switch (state) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'connecting'
    case 'unavailable':
      return 'reconnecting'
    case 'failed':
      return 'error'
    case 'disconnected':
      return 'disconnected'
    default:
      // 'initialized' and any future pusher-js state.
      return 'connecting'
  }
}

/**
 * Subscribes to the current restaurant's private Reverb channel
 * (`restaurant.{id}`, see routes/channels.php + docs/realtime.md) and
 * turns incoming domain events into a debounced signal the caller uses to
 * refetch GET /operations/live — never a second way to mutate/derive
 * domain state on the frontend (Passo 1.3 §5).
 *
 * `restaurantId`/`enabled` mirror useRestaurantOperations' own reactive
 * gate exactly: switching restaurants leaves the old channel and joins
 * the new one, and `enabled() === false` (no view_operations on the
 * current restaurant) never subscribes at all — see the docblock on
 * `can()`'s gate in DashboardView for why that's a deliberate frontend
 * choice, not something the channel's own authorization rule requires
 * (routes/channels.php reuses RestaurantPolicy::view()'s broader
 * reachability, not view_operations — a waiter could technically
 * subscribe, but this app never opens a socket it has no UI to feed).
 *
 * `lastEvent` is the raw, non-debounced envelope of the most recent event
 * — for a consumer that needs to react to one SPECIFIC event name
 * immediately (e.g. the Floor Plan Editor's own conflict handling for
 * `floor_plan.updated`, Passo 1.3 §20) without waiting on the coalesced
 * operational refresh below.
 *
 * `refreshTick` increments (debounced/coalesced — Passo 1.3 §17) whenever
 * one-or-more events in EVENTS_REQUIRING_OPERATIONS_REFRESH arrive within
 * a 250ms window, and once more right after every successful channel
 * subscription (including Pusher/Reverb's own automatic resubscribe after
 * a reconnect) — closing the small race window docs/realtime.md calls out
 * between fetching the snapshot and the subscription actually taking
 * effect, and doubling as the reconnect "catch-up" refetch (Passo 1.3
 * §27) for free, since a resubscribe re-fires the same success callback.
 */
export function useRestaurantRealtime(restaurantId: () => number | null, enabled: () => boolean) {
  const connectionState = ref<RealtimeConnectionState>('disconnected')
  const lastEvent = ref<ReceivedRealtimeEvent | null>(null)
  const refreshTick = ref(0)

  let joinedRestaurantId: number | null = null
  let unbindConnectionChange: (() => void) | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleRefresh(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      refreshTick.value += 1
    }, REFRESH_DEBOUNCE_MS)
  }

  function leaveCurrentChannel(): void {
    if (joinedRestaurantId === null) return
    getEcho()?.leave(`restaurant.${joinedRestaurantId}`)
    joinedRestaurantId = null
  }

  function subscribeTo(id: number): void {
    const echo = getEcho()
    if (!echo) {
      connectionState.value = 'unavailable'
      return
    }

    joinedRestaurantId = id
    const pusherConnection = echo.connector.pusher.connection
    connectionState.value = mapPusherState(pusherConnection.state)

    // One connection-level listener is enough for the whole session — it
    // doesn't need to be re-bound per restaurant switch, only ever torn
    // down on unmount.
    if (!unbindConnectionChange) {
      const onStateChange = ({ current }: { previous: string; current: string }): void => {
        connectionState.value = mapPusherState(current)
      }
      pusherConnection.bind('state_change', onStateChange)
      unbindConnectionChange = () => pusherConnection.unbind('state_change', onStateChange)
    }

    const channel: Channel = echo.private(`restaurant.${id}`)

    channel.subscribed(() => scheduleRefresh())
    channel.error(() => {
      connectionState.value = 'error'
    })

    // A leading "." tells laravel-echo's EventFormatter to use this exact
    // wire name verbatim instead of namespacing/mangling it as a Laravel
    // event class name — required for every custom broadcastAs() name.
    for (const name of REALTIME_EVENT_NAMES) {
      channel.listen(`.${name}`, (payload: RealtimeEventEnvelope) => {
        lastEvent.value = { ...payload, name }
        if (EVENTS_REQUIRING_OPERATIONS_REFRESH.includes(name)) scheduleRefresh()
      })
    }
  }

  watch(
    () => [restaurantId(), enabled()] as const,
    ([id, isEnabled]) => {
      // Always leave before joining anything else — including a same-id
      // re-evaluation — so A → B → A → B never leaves stale listeners
      // bound to an earlier channel instance (Passo 1.3 §29).
      leaveCurrentChannel()
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }

      if (id !== null && isEnabled) {
        subscribeTo(id)
      } else {
        connectionState.value = 'disconnected'
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    leaveCurrentChannel()
    unbindConnectionChange?.()
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return { connectionState, lastEvent, refreshTick }
}
