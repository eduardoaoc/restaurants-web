import { onBeforeUnmount, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { getChannelAuthorizationFailure, getEcho } from '@/realtime/echo'
import { EVENTS_REQUIRING_OPERATIONS_REFRESH, REALTIME_EVENT_NAMES,
  type RealtimeConnectionState, type RealtimeEventEnvelope, type RealtimeEventName } from '@/types/realtime'

const REFRESH_DEBOUNCE_MS = 250
const DIAGNOSTIC_TIMEOUT_MS = 10_000
const FALLBACK_INTERVAL_MS = 15_000
// A healthy socket does not prove events are being published: if the
// realtime-local queue worker stops, the WebSocket stays connected while
// broadcasts pile up in the queue. A slow REST reconcile while connected
// (re-armed by every refresh, so an active feed never adds extra reads)
// bounds how stale a screen can get in that case.
const CONNECTED_SAFETY_INTERVAL_MS = 60_000

type RefreshSource = 'event' | 'subscription' | 'fallback' | 'resume' | 'mutation'
export interface ReceivedRealtimeEvent extends RealtimeEventEnvelope { name: RealtimeEventName }
interface RefreshOptions {
  /** Await the authoritative reads so polling never overlaps itself. */
  refresh?: () => Promise<readonly (ApiError | null)[]>
}

/** One active screen subscription, using the session's singleton Echo. Socket
 * connectivity alone is insufficient: only subscription success means live.
 * Events invalidate REST snapshots; they never patch order status locally. */
export function useRestaurantRealtime(restaurantId: () => number | null, enabled: () => boolean, options: RefreshOptions = {}) {
  const connectionState = ref<RealtimeConnectionState>('disconnected')
  const lastEvent = ref<ReceivedRealtimeEvent | null>(null)
  const refreshTick = ref(0)
  const lastRefreshSource = ref<RefreshSource | null>(null)
  let generation = 0
  let disposed = false
  let cleanupSubscription: (() => void) | null = null
  let resumeSubscription: (() => void) | null = null
  let diagnosticTimer: ReturnType<typeof setTimeout> | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let authRetryTimer: ReturnType<typeof setTimeout> | null = null
  let refreshing = false
  let queuedSource: RefreshSource | null = null
  let retryDelay = FALLBACK_INTERVAL_MS
  let retryAt = 0
  let readDenied = false
  let safetyArmed = false

  const active = () => !disposed && restaurantId() !== null && enabled()
  const visibleOnline = () => !document.hidden && navigator.onLine
  const clearRefreshTimer = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = null }
  const clearDiagnostic = () => { if (diagnosticTimer) clearTimeout(diagnosticTimer); diagnosticTimer = null }

  function armDiagnostic(epoch: number): void {
    if (diagnosticTimer) return // Retry transitions must not reset the deadline.
    diagnosticTimer = setTimeout(() => {
      diagnosticTimer = null
      if (epoch === generation && connectionState.value !== 'connected' && connectionState.value !== 'error') {
        connectionState.value = 'unavailable'
      }
    }, DIAGNOSTIC_TIMEOUT_MS)
  }

  function schedule(source: RefreshSource, delay = REFRESH_DEBOUNCE_MS): void {
    safetyArmed = false
    if (!active() || !visibleOnline() || readDenied) return
    if (refreshing) { queuedSource = source; return }
    // A domain event supersedes a future fallback, but not Retry-After.
    clearRefreshTimer()
    refreshTimer = setTimeout(() => { refreshTimer = null; void refresh(source) }, Math.max(delay, retryAt - Date.now()))
  }

  function scheduleFallback(): void {
    if (!options.refresh) return
    const connected = connectionState.value === 'connected'
    // A pending slow safety reconcile must not delay the 15 s fallback once
    // the connection is lost; any other pending refresh is kept.
    if (refreshTimer && !(safetyArmed && !connected)) return
    schedule('fallback', connected ? Math.max(retryDelay, CONNECTED_SAFETY_INTERVAL_MS) : retryDelay)
    safetyArmed = connected && refreshTimer !== null
  }

  async function refresh(source: RefreshSource): Promise<void> {
    if (!active() || !visibleOnline() || readDenied) return
    if (refreshing) { queuedSource = source; return }
    const epoch = generation
    refreshing = true
    lastRefreshSource.value = source
    refreshTick.value++
    try {
      const errors = await options.refresh?.() ?? []
      if (epoch !== generation) return
      const rateLimited = errors.find(error => error?.kind === 'rate_limited')
      readDenied = errors.some(error => error && ['forbidden', 'unauthenticated'].includes(error.kind))
      retryDelay = errors.some(Boolean) ? Math.min(retryDelay * 2, 120_000) : FALLBACK_INTERVAL_MS
      retryAt = rateLimited ? Date.now() + Math.max(retryDelay, (rateLimited.retryAfterSeconds ?? 0) * 1000) : 0
    } catch {
      if (epoch === generation) retryDelay = Math.min(retryDelay * 2, 120_000)
    } finally {
      refreshing = false
      if (!disposed) {
        const next = queuedSource
        queuedSource = null
        if (next) schedule(next)
        else scheduleFallback()
      }
    }
  }

  function subscribeTo(id: number, epoch: number, authRetryDelay = FALLBACK_INTERVAL_MS): void {
    const echo = getEcho()
    if (!echo) { connectionState.value = 'unavailable'; scheduleFallback(); return }
    const connection = echo.connector.pusher.connection
    let subscribed = false
    let previouslySubscribed = false
    let authFailed = false
    let timedOut = false
    let released = false
    let retryAuthOnResume: (() => void) | null = null
    const current = () => !released && active() && epoch === generation && restaurantId() === id
    const updateState = ({ current: state }: { current: string }): void => {
      if (!current()) return
      if (state !== 'connected') { subscribed = false; authFailed = false }
      if (!navigator.onLine) connectionState.value = 'unavailable'
      else if (subscribed && state === 'connected') connectionState.value = 'connected'
      else if (authFailed) connectionState.value = 'error'
      else if (state === 'unavailable' || state === 'failed' || state === 'disconnected' || timedOut) connectionState.value = 'unavailable'
      else connectionState.value = previouslySubscribed ? 'reconnecting' : 'connecting'
      if (connectionState.value !== 'connected') armDiagnostic(epoch)
      else clearDiagnostic()
      scheduleFallback()
    }
    updateState({ current: connection.state })
    connection.bind('state_change', updateState)
    const channel = echo.private(`restaurant.${id}`)
    const seen = new Set<string>()
    const onSubscribed = (): void => {
      if (!current() || connection.state !== 'connected') return
      subscribed = true
      previouslySubscribed = true
      authFailed = false
      retryAuthOnResume = null
      timedOut = false
      connectionState.value = 'connected'
      clearDiagnostic()
      if (authRetryTimer) clearTimeout(authRetryTimer)
      authRetryTimer = null
      clearRefreshTimer()
      schedule('subscription') // Catch up after initial join AND reconnect.
    }
    const onError = (failure: unknown): void => {
      if (!current()) return
      subscribed = false
      authFailed = true
      connectionState.value = 'error'
      clearDiagnostic()
      scheduleFallback()
      const detail = failure as { status?: number; error?: unknown }
      const error = getChannelAuthorizationFailure(`private-restaurant.${id}`) ?? normalizeApiError(detail?.error ?? failure)
      const status = detail?.status ?? error.status
      if (status && [401, 403, 419].includes(status)) { retryAuthOnResume = null; return }
      const retryAuthAt = Date.now() + Math.max(authRetryDelay, (error.retryAfterSeconds ?? 0) * 1000)
      retryAuthOnResume = () => {
        if (authRetryTimer || !current() || !visibleOnline()) return
        authRetryTimer = setTimeout(() => {
          authRetryTimer = null
          if (!current() || !visibleOnline()) return
          cleanupSubscription?.()
          subscribeTo(id, epoch, Math.min(authRetryDelay * 2, 120_000))
        }, Math.max(0, retryAuthAt - Date.now()))
      }
      retryAuthOnResume()
    }
    channel.subscribed(onSubscribed)
    channel.error(onError)
    const listeners = REALTIME_EVENT_NAMES.map(name => {
      const listener = (payload: RealtimeEventEnvelope): void => {
        if (!current() || !subscribed || payload.restaurant_id !== id || payload.schema_version !== 1 || !payload.event_id || seen.has(payload.event_id)) return
        seen.add(payload.event_id)
        if (seen.size > 500) seen.delete(seen.values().next().value!)
        lastEvent.value = { ...payload, name }
        if (EVENTS_REQUIRING_OPERATIONS_REFRESH.includes(name)) schedule('event')
      }
      channel.listen(`.${name}`, listener)
      return { name, listener }
    })
    // The diagnostic deadline is sticky throughout a failed attempt, including
    // transports that repeatedly cycle connecting without reaching unavailable.
    const stopDiagnosticWatch = watch(connectionState, state => {
      if (state === 'unavailable') timedOut = true
    }, { flush: 'sync' })
    cleanupSubscription = () => {
      released = true
      resumeSubscription = null
      connection.unbind('state_change', updateState)
      stopDiagnosticWatch()
      for (const { name, listener } of listeners) channel.stopListening(`.${name}`, listener)
      echo.leave(`restaurant.${id}`)
    }
    resumeSubscription = () => { updateState({ current: connection.state }); retryAuthOnResume?.() }
  }

  watch(() => [restaurantId(), enabled()] as const, ([id, isEnabled]) => {
    generation++
    cleanupSubscription?.()
    cleanupSubscription = null
    clearDiagnostic()
    clearRefreshTimer()
    if (authRetryTimer) clearTimeout(authRetryTimer)
    authRetryTimer = null
    queuedSource = null
    lastEvent.value = null
    retryDelay = FALLBACK_INTERVAL_MS
    retryAt = 0
    readDenied = false
    connectionState.value = 'disconnected'
    if (id !== null && isEnabled) subscribeTo(id, generation)
  }, { immediate: true, flush: 'sync' })

  const resume = (): void => {
    if (active() && visibleOnline()) { resumeSubscription?.(); schedule('resume') }
    else clearRefreshTimer()
  }
  const offline = (): void => {
    clearRefreshTimer()
    if (active()) connectionState.value = 'unavailable'
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('focus', resume)
  window.addEventListener('online', resume)
  window.addEventListener('offline', offline)
  onBeforeUnmount(() => {
    disposed = true
    generation++
    cleanupSubscription?.()
    clearDiagnostic()
    clearRefreshTimer()
    if (authRetryTimer) clearTimeout(authRetryTimer)
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('focus', resume)
    window.removeEventListener('online', resume)
    window.removeEventListener('offline', offline)
  })

  return { connectionState, lastEvent, refreshTick, lastRefreshSource, refresh: () => schedule('mutation') }
}
