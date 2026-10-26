/** Production composable, simulated transport and deterministic clock. No API writes. */
import { createApp, h, nextTick, ref } from 'vue'
import { AxiosError } from 'axios'
import type { ChannelAuthorizerGenerator } from 'pusher-js'
import { http } from '../src/api/http'
import { appConfig } from '../src/config/runtime'
import { disconnectEcho, getChannelAuthorizationFailure, getEcho } from '../src/realtime/echo'
import { useRestaurantRealtime } from '../src/composables/useRestaurantRealtime'
import type { ApiError } from '../src/api/errors'

export async function runRealtimeChecks() {
  let checks = 0
  const check = (value: unknown, message: string) => { if (!value) throw Error(message); checks++ }
  const originalReverb = appConfig.reverb
  disconnectEcho()
  appConfig.reverb = { key: 'fixture', host: '127.0.0.1', port: 1, tls: false }
  const echo = getEcho()!
  echo.disconnect()
  const originalAdapter = http.defaults.adapter
  try {
    http.defaults.adapter = async config => {
      const response = { status: 403, statusText: 'Forbidden', data: {}, headers: {}, config }
      throw new AxiosError('Forbidden', 'ERR_BAD_RESPONSE', config, null, response)
    }
    const authorizer = echo.options.authorizer as ChannelAuthorizerGenerator
    await new Promise<void>(resolve => {
      authorizer({ name: 'private-restaurant.99' }, {} as Parameters<ChannelAuthorizerGenerator>[1]).authorize('fixture.socket', () => resolve())
    })
    check(getChannelAuthorizationFailure('private-restaurant.99')?.status === 403, 'custom Axios authorizer preserves status stripped by Pusher')
  } finally { http.defaults.adapter = originalAdapter }
  const connection = echo.connector.pusher.connection
  const connectionListeners = new Set<(change: { current: string }) => void>()
  connection.bind = ((_name: string, cb: (change: { current: string }) => void) => { connectionListeners.add(cb); return connection }) as typeof connection.bind
  connection.unbind = ((_name: string, cb: (change: { current: string }) => void) => { connectionListeners.delete(cb); return connection }) as typeof connection.unbind
  type FakeChannel = { success: () => void; failure: (error: unknown) => void; listeners: Map<string, (payload: unknown) => void> }
  const channels = new Map<string, FakeChannel>()
  const left: string[] = []
  echo.private = ((name: string) => {
    const fake: FakeChannel = { success: () => {}, failure: () => {}, listeners: new Map() }
    channels.set(name, fake)
    const channel = {
      subscribed(callback: () => void) { fake.success = callback; return channel },
      error(callback: (error: unknown) => void) { fake.failure = callback; return channel },
      listen(event: string, callback: (payload: unknown) => void) { fake.listeners.set(event, callback); return channel },
      stopListening(event: string) { fake.listeners.delete(event); return channel },
    }
    return channel
  }) as typeof echo.private
  echo.leave = name => { channels.delete(name); left.push(name) }
  const realTimeout = window.setTimeout, realClearTimeout = window.clearTimeout, realNow = Date.now
  let now = 1_000_000, sequence = 0
  const timers = new Map<number, { at: number; callback: () => void; operational: boolean }>()
  window.setTimeout = ((callback: () => void, delay = 0) => {
    const id = ++sequence
    const operational = new Error().stack?.split('\n')[2]?.includes('useRestaurantRealtime') ?? false
    timers.set(id, { at: now + delay, callback, operational }); return id
  }) as typeof window.setTimeout
  window.clearTimeout = (id: number | undefined) => { if (id !== undefined) timers.delete(id) }
  Date.now = () => now
  const settle = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() } }
  const advance = async (ms: number) => {
    const end = now + ms
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at; timers.delete(next[0]); next[1].callback(); await settle()
    }
    now = end; await settle()
  }
  const state = (value: string) => { connection.state = value; connectionListeners.forEach(cb => cb({ current: value })) }
  const id = ref<number | null>(1), enabled = ref(true)
  let reads = 0, inFlight = 0, maxInFlight = 0, errors: (ApiError | null)[] = [], release: (() => void) | null = null
  let slow = false
  let feed!: ReturnType<typeof useRestaurantRealtime>
  const app = createApp({ setup() {
    feed = useRestaurantRealtime(() => id.value, () => enabled.value, { refresh: async () => {
      reads++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      if (slow) await new Promise<void>(resolve => { release = resolve })
      inFlight--; return errors
    } })
    return () => h('div')
  } })
  const host = document.createElement('div'); document.body.append(host)
  const event = (channel: FakeChannel, eventId: string, restaurant = 1) => channel.listeners.get('.order.created')?.({ restaurant_id: restaurant, schema_version: 1, event_id: eventId, occurred_at: '2026-10-21T10:00:00Z' })
  try {
    state('connecting'); app.mount(host)
    check([...timers.values()].some(timer => timer.operational), 'clock tracks production timers')
    check(feed.connectionState.value === 'connecting', 'initial connecting')
    await advance(9000); state('connecting'); await advance(1000)
    check(feed.connectionState.value === 'unavailable', 'deadline does not restart on repeated connecting')
    await advance(5000); check(reads === 1, 'unavailable fallback reads automatically')
    state('connected'); check(feed.connectionState.value !== 'connected', 'socket alone is not channel authorization')
    let channel = channels.get('restaurant.1')!
    channel.failure({ status: 403 }); check(feed.connectionState.value === 'error', 'subscription denial surfaced')
    await advance(15000); check(channels.get('restaurant.1') === channel, '403 does not loop auth requests')
    channel.success(); check(feed.connectionState.value === 'connected', 'confirmed subscription is live')
    await advance(250); const before = reads
    await advance(59000); check(reads === before, '15 s fallback polling stops while channel is healthy')
    await advance(1000); check(reads === before + 1, 'one 60 s safety reconcile while connected (worker may be stopped)')
    const afterSafety = reads
    event(channel, 'same'); event(channel, 'same'); event(channel, 'wrong', 2)
    await advance(250); check(reads === afterSafety + 1, 'duplicate and wrong tenant events ignored')
    await advance(59000); check(reads === afterSafety + 1, 'an event re-arms the safety reconcile instead of adding reads')
    state('connecting'); check(feed.connectionState.value === 'reconnecting', 'loss after live is reconnecting')
    const lossReads = reads
    await advance(10000); check(feed.connectionState.value === 'unavailable', 'reconnect deadline bounded')
    await advance(5000); check(reads === lossReads + 1, 'loss replaces the 60 s safety timer with the 15 s fallback')
    state('connected'); channel.success(); await advance(250)
    check(feed.lastRefreshSource.value === 'subscription', 'reconnect reconciles REST')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline'))
    check(feed.connectionState.value === 'unavailable', 'offline is honest even before socket state changes')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); await advance(250)
    check(feed.connectionState.value === 'connected', 'online recovers an already subscribed socket')
    const oldChannel = channel, staleSuccess = channel.success, staleEvent = channel.listeners.get('.order.created')!
    id.value = 2; await settle()
    check(left.includes('restaurant.1') && connectionListeners.size === 1, 'switch leaves old channel and connection listener')
    staleSuccess(); staleEvent({ restaurant_id: 1, schema_version: 1, event_id: 'late' }); await advance(250)
    check(feed.lastEvent.value === null && feed.connectionState.value !== 'connected', 'old context callbacks ignored')
    channel = channels.get('restaurant.2')!; channel.success(); await advance(250)
    id.value = 1; await settle(); staleSuccess(); check(feed.connectionState.value !== 'connected', 'A to B to A rejects first A callbacks')
    channel = channels.get('restaurant.1')!; channel.failure({ status: 500 })
    await advance(15000); check(channels.get('restaurant.1') !== channel, 'transient auth failure retries with delay')
    channel = channels.get('restaurant.1')!; channel.success(); await advance(250)
    slow = true; event(channel, 'slow'); await advance(250)
    event(channel, 'during'); await advance(50000)
    check(maxInFlight === 1, 'event refreshes cannot overlap')
    slow = false; release?.(); await settle(); await advance(250)
    check(maxInFlight === 1 && inFlight === 0, 'one coalesced followup after slow read')
    state('unavailable'); slow = true; await advance(15000); const slowReads = reads
    await advance(90000); check(reads === slowReads && maxInFlight === 1, 'slow fallback does not start overlapping polls')
    slow = false; release?.(); await settle()
    state('unavailable'); errors = [{ kind: 'rate_limited', status: 429, retryAfterSeconds: 90 }]
    await advance(15000); const limited = reads
    window.dispatchEvent(new Event('focus')); await advance(89000)
    check(reads === limited, 'Retry-After survives focus and transport signals')
    errors = []; await advance(1000); check(reads === limited + 1, 'reads resume after Retry-After')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'))
    const hiddenReads = reads; await advance(120000); check(reads === hiddenReads, 'hidden tab pauses polling')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); await advance(250)
    check(reads === hiddenReads + 1, 'visible tab reconciles')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline'))
    const offlineReads = reads; await advance(120000); check(reads === offlineReads, 'offline pauses reads')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); await advance(250)
    check(reads === offlineReads + 1, 'online reconciles')
    errors = [{ kind: 'forbidden', status: 403 }]; await advance(15000); const deniedReads = reads
    await advance(120000); check(reads === deniedReads, 'forbidden reads stop fallback')
    enabled.value = false; await settle(); const disabledReads = reads
    check(feed.connectionState.value === 'disconnected' && connectionListeners.size === 0 && channels.size === 0, 'logout gate releases listeners and channel')
    oldChannel.success(); await advance(120000); check(reads === disabledReads, 'disabled context ignores late work')
    enabled.value = true; await settle(); channels.get('restaurant.1')!.success(); await advance(250)
    app.unmount(); const finalReads = reads; window.dispatchEvent(new Event('focus')); await advance(120000)
    check(reads === finalReads && connectionListeners.size === 0, `unmount removes listeners (reads ${reads}/${finalReads}, timers ${timers.size}, listeners ${connectionListeners.size})`)
    check([...timers.values()].every(timer => !timer.operational), 'no operational timers remain after unmount')
    disconnectEcho()
    check(!getChannelAuthorizationFailure('private-restaurant.99'), 'logout clears authorization metadata')
    return { checks, maxInFlight }
  } finally {
    app.unmount(); host.remove()
    delete (document as unknown as Record<string, unknown>).hidden
    delete (navigator as unknown as Record<string, unknown>).onLine
    window.setTimeout = realTimeout; window.clearTimeout = realClearTimeout; Date.now = realNow
    disconnectEcho(); appConfig.reverb = originalReverb
  }
}
