import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { getEcho, retainPrivateChannel } from '@/realtime/echo'
import { restaurantActivityService } from '@/services/restaurant-activity.service'
import type { RestaurantActivityCategory, RestaurantActivityEvent } from '@/types/activity'

const MARK_READ_DEBOUNCE_MS = 800

/**
 * The operational activity timeline (Carta 6.1B) — the one place that
 * owns fetching, realtime, pagination, filtering and read-state for the
 * notification bell/panel. A composable, not a Pinia store (CLAUDE.md §11
 * — this is screen-local state for the bell/panel, never cross-cutting
 * global state another unrelated screen needs to read).
 *
 * Full-feed consumers keep the view_activity channel; assignment-only
 * consumers use their existing private user channel plus scoped REST. No
 * activity-channel authorization is broadened. Both recover durable reads
 * after reconnect/focus and poll with backoff while disconnected.
 *
 * Own, dedicated Reverb subscription — deliberately NOT
 * `useRestaurantRealtime` (which is hardwired to the `restaurant.{id}`
 * channel and the Operations event catalog): the activity feed has its
 * own channel (`restaurant.{id}.activity`) and its own single event
 * (`restaurant.activity.created`), gated by `view_activity` specifically
 * (routes/channels.php) — a waiter who can reach `restaurant.{id}` must
 * never be able to join this one.
 *
 * `restaurantId`/`enabled` mirror every other restaurant-scoped
 * composable's own reactive gate (useRestaurantRealtime, useRestaurantSettings,
 * ...): switching restaurants or losing `view_activity` tears everything
 * down and starts clean — no stale restaurant's events/unread ever
 * lingers (Carta 6.1B §19).
 */
export function useRestaurantActivity(restaurantId: () => number | null, enabled: () => boolean, fullFeed: () => boolean = () => true) {
  const authStore = useAuthStore()
  const scope = () => fullFeed() ? undefined : 'assignments' as const
  let generation = 0
  let eventRevision = 0
  let unreadRequest = 0
  let releaseChannel: (() => void) | null = null
  let connected = false
  let readDenied = false
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let fallbackDelay = 15_000
  let stopped = false
  const events = ref<RestaurantActivityEvent[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<ApiError | null>(null)
  const loadMoreError = ref<ApiError | null>(null)
  const unreadCount = ref(0)
  const lastReadEventId = ref(0)
  const nextCursor = ref<string | null>(null)
  const category = ref<RestaurantActivityCategory | null>(null)
  /** Whether the caller's panel UI is currently open — set via `setPanelOpen()`, read only to decide realtime auto-mark-read behaviour (§16/§17), never to gate fetching itself. */
  const panelOpen = ref(false)

  let controller: AbortController | null = null
  let loadMoreController: AbortController | null = null
  let targetRestaurantId: number | null = null
  let markReadDebounce: ReturnType<typeof setTimeout> | null = null
  const seenIds = new Set<number>()

  function resetLocal(): void {
    events.value = []
    nextCursor.value = null
    unreadCount.value = 0
    lastReadEventId.value = 0
    error.value = null
    loadMoreError.value = null
    seenIds.clear()
    if (markReadDebounce) {
      clearTimeout(markReadDebounce)
      markReadDebounce = null
    }
  }

  function currentFilterParams(): { category?: RestaurantActivityCategory; scope?: 'assignments' } {
    return { ...(category.value ? { category: category.value } : {}), scope: scope() }
  }

  /** The full first page — called on panel open, filter change, and Reverb (re)subscribe reconciliation (§26). */
  async function fetchFirstPage(): Promise<void> {
    const revision = eventRevision
    const badgeRequest = ++unreadRequest
    const epoch = generation
    const id = restaurantId()
    if (id === null || !enabled()) return
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    targetRestaurantId = id
    loading.value = true
    error.value = null

    try {
      const { activity, meta } = await restaurantActivityService.list(id, currentFilterParams(), signal)
      if (signal.aborted || targetRestaurantId !== id || epoch !== generation) return
      if (revision !== eventRevision) return await fetchFirstPage()
      fallbackDelay = 15_000
      events.value = activity
      seenIds.clear()
      for (const event of activity) seenIds.add(event.id)
      nextCursor.value = meta.next_cursor
      lastReadEventId.value = meta.last_read_event_id
      if (badgeRequest === unreadRequest) unreadCount.value = meta.unread_count
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
      fallbackDelay = Math.max(Math.min(fallbackDelay * 2, 120_000), (error.value.retryAfterSeconds ?? 0) * 1000)
      if (['forbidden', 'unauthenticated'].includes(error.value.kind)) readDenied = true
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  /** Cursor pagination "Mostrar anteriores" (§20) — always appends, never replaces `events`. */
  async function loadMore(): Promise<void> {
    const epoch = generation
    const id = restaurantId()
    if (id === null || nextCursor.value === null || loadingMore.value) return
    loadMoreController?.abort()
    loadMoreController = new AbortController()
    const { signal } = loadMoreController
    loadingMore.value = true
    loadMoreError.value = null

    try {
      const { activity, meta } = await restaurantActivityService.list(
        id,
        { ...currentFilterParams(), cursor: nextCursor.value },
        signal,
      )
      if (signal.aborted || targetRestaurantId !== id || epoch !== generation) return
      for (const event of activity) {
        if (seenIds.has(event.id)) continue
        seenIds.add(event.id)
        events.value.push(event)
      }
      nextCursor.value = meta.next_cursor
      lastReadEventId.value = meta.last_read_event_id
      unreadCount.value = meta.unread_count
    } catch (err) {
      if (signal.aborted) return
      loadMoreError.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loadingMore.value = false
    }
  }

  /** Cheap badge-only refresh — used on restaurant switch/subscribe so the bell is correct even before the panel is ever opened. */
  async function refreshUnreadOnly(): Promise<void> {
    const badgeRequest = ++unreadRequest
    const epoch = generation
    const id = restaurantId()
    if (id === null || !enabled()) return
    try {
      const state = await restaurantActivityService.unreadCount(id, undefined, scope())
      if (restaurantId() !== id || epoch !== generation) return
      if (badgeRequest !== unreadRequest) return
      unreadCount.value = state.unread_count
      lastReadEventId.value = state.last_read_event_id
      fallbackDelay = 15_000
    } catch (err) {
      if (epoch !== generation) return
      const failure = normalizeApiError(err)
      fallbackDelay = Math.max(Math.min(fallbackDelay * 2, 120_000), (failure.retryAfterSeconds ?? 0) * 1000)
      if (['forbidden', 'unauthenticated'].includes(failure.kind)) readDenied = true
      // Best-effort — the panel's own fetchFirstPage is the authoritative path; a failed badge refresh just leaves the previous (or zero) count showing.
    }
  }

  /**
   * Moves the read cursor forward to the newest event currently loaded
   * (§15/§32) — never invented, never `unread.value = 0` locally; the
   * response is the new authority.
   */
  async function markReadUpToNewest(): Promise<void> {
    const epoch = generation
    const id = restaurantId()
    const newest = events.value[0]?.id
    if (id === null || newest === undefined) return
    try {
      const state = await restaurantActivityService.markRead(id, newest, scope())
      if (restaurantId() !== id || epoch !== generation) return
      lastReadEventId.value = state.last_read_event_id
      unreadCount.value = state.unread_count
    } catch {
      // Best-effort — unread just stays as last known; the next successful call (or REST refresh) reconciles it.
    }
  }

  /** §15 — load, render, THEN mark read; never before the fetch actually succeeds. */
  async function openPanel(): Promise<void> {
    panelOpen.value = true
    await fetchFirstPage()
    if (!error.value) await markReadUpToNewest()
  }

  function closePanel(): void {
    panelOpen.value = false
    if (markReadDebounce) {
      clearTimeout(markReadDebounce)
      markReadDebounce = null
    }
  }

  /** §21/§22 — a filter change is a fresh first page (cursors are per-filtered-query on the backend); unread/last-read are resynced from the response but never redefined BY the filter. */
  async function setCategory(next: RestaurantActivityCategory | null): Promise<void> {
    if (category.value === next) return
    category.value = next
    await fetchFirstPage()
  }

  function retry(): void {
    void fetchFirstPage()
  }

  const hasMore = computed(() => nextCursor.value !== null)

  function leaveChannel(): void {
    releaseChannel?.()
    releaseChannel = null
    connected = false
  }

  function handleIncomingEvent(activity: RestaurantActivityEvent): void {
    if (seenIds.has(activity.id)) return
    seenIds.add(activity.id)
    eventRevision++
    unreadRequest++

    // §22 — unread always reflects the WHOLE feed, never just the active filter.
    if (activity.id > lastReadEventId.value) unreadCount.value += 1

    // Only splice into the visible list if it matches the current filter —
    // otherwise the badge still moved, but the (filtered) list stays correct.
    if (category.value === null || category.value === activity.category) {
      events.value = [activity, ...events.value]
    }

    // §17 — only auto-mark-read while the panel is genuinely open and the
    // tab is visible; debounced so a burst of events doesn't fire a POST
    // per event.
    if (panelOpen.value && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (markReadDebounce) clearTimeout(markReadDebounce)
      markReadDebounce = setTimeout(() => {
        markReadDebounce = null
        void markReadUpToNewest()
      }, MARK_READ_DEBOUNCE_MS)
    }
  }

  function subscribeTo(id: number): void {
    const echo = getEcho()
    const userId = authStore.user?.id
    if (!echo || (!fullFeed() && !userId)) return
    const epoch = generation
    const retained = retainPrivateChannel(fullFeed() ? `restaurant.${id}.activity` : `user.${userId}`)
    if (!retained) return
    const channel = retained.channel
    const current = () => generation === epoch && restaurantId() === id && enabled()
    const reconcile = () => {
      if (!current()) return
      connected = true
      void refreshUnreadOnly()
      if (panelOpen.value) void fetchFirstPage()
    }
    const connection = echo.connector.pusher.connection
    const onState = ({ current: state }: { current: string }) => { if (state !== 'connected') connected = false }
    const listener = (payload: { restaurant_id: number; activity: RestaurantActivityEvent }) => {
      if (!current() || payload.restaurant_id !== id) return
      if (!fullFeed() && payload.activity.metadata?.recipient_user_id !== userId) return
      handleIncomingEvent(payload.activity)
    }
    connection.bind('state_change', onState)
    const onError = () => { if (current()) connected = false }
    // Bind named callbacks so a shared channel can remove this consumer only.
    channel.listen('.pusher:subscription_succeeded', reconcile)
    channel.listen('.pusher:subscription_error', onError)
    channel.listen('.restaurant.activity.created', listener)
    // A shared user channel might already be subscribed by ready-order alerts.
    if ('subscription' in channel && (channel.subscription as { subscribed?: boolean }).subscribed) reconcile()
    releaseChannel = () => {
      connection.unbind('state_change', onState)
      retained.channel.stopListening('.restaurant.activity.created', listener)
      retained.channel.stopListening('.pusher:subscription_succeeded', reconcile)
      retained.channel.stopListening('.pusher:subscription_error', onError)
      retained.release()
    }
  }

  async function fallback(): Promise<void> {
    if (stopped) return
    if (enabled() && restaurantId() !== null && !document.hidden && navigator.onLine && !connected && !readDenied) {
      if (panelOpen.value) await fetchFirstPage()
      else await refreshUnreadOnly()
    }
    if (!stopped) fallbackTimer = setTimeout(() => { void fallback() }, fallbackDelay)
  }
  const resume = () => {
    if (enabled() && !document.hidden && navigator.onLine) {
      void refreshUnreadOnly()
      if (panelOpen.value) void fetchFirstPage()
    }
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('online', resume)
  window.addEventListener('focus', resume)
  fallbackTimer = setTimeout(() => { void fallback() }, fallbackDelay)

  watch(
    () => [restaurantId(), enabled(), fullFeed(), authStore.user?.id] as const,
    ([id, isEnabled]) => {
      // Always leave before joining anything else — including a same-id
      // re-evaluation — so A → B → A → B never leaves a stale listener
      // bound to an earlier channel instance (§19).
      generation++
      unreadRequest++
      eventRevision++
      leaveChannel()
      controller?.abort()
      loadMoreController?.abort()
      resetLocal()
      targetRestaurantId = id
      fallbackDelay = 15_000
      readDenied = false
      loading.value = false
      loadingMore.value = false

      if (id !== null && isEnabled) {
        subscribeTo(id)
        void refreshUnreadOnly()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stopped = true
    generation++
    if (fallbackTimer) clearTimeout(fallbackTimer)
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('online', resume)
    window.removeEventListener('focus', resume)
    leaveChannel()
    controller?.abort()
    loadMoreController?.abort()
    if (markReadDebounce) clearTimeout(markReadDebounce)
  })

  return {
    events,
    loading,
    loadingMore,
    error,
    loadMoreError,
    unreadCount,
    lastReadEventId,
    hasMore,
    category,
    panelOpen,
    openPanel,
    closePanel,
    loadMore,
    setCategory,
    retry,
  }
}
