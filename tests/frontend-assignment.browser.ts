/** Real activity UI/composables and services; simulated HTTP and Echo only. */
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { http } from '../src/api/http'
import { appConfig } from '../src/config/runtime'
import { disconnectEcho, getEcho } from '../src/realtime/echo'
import { i18n } from '../src/i18n'
import { useAuthStore } from '../src/stores/auth'
import { useRestaurantStore } from '../src/stores/restaurant'
import { useRestaurantActivity } from '../src/composables/useRestaurantActivity'
import { useReadyOrderNotifications } from '../src/composables/useReadyOrderNotifications'
import ActivityBell from '../src/components/shared/ActivityBell.vue'
import ActivityEventItem from '../src/components/shared/ActivityEventItem.vue'
import { useActivityPanelToggle } from '../src/composables/useActivityPanelToggle'
import type { RestaurantActivityEvent } from '../src/types/activity'

const settle = async () => { await new Promise(resolve => setTimeout(resolve, 40)); await nextTick() }
const item = (id = 1, recipient = 5): RestaurantActivityEvent => ({
  id, type: 'table_session.waiter_assigned', category: 'service', tone: 'warning', occurred_at: new Date().toISOString(),
  actor: { type: 'customer', id: null, name: null }, table: { id: 10, name: 'Mesa Terraza 10' }, table_session_id: 50,
  target_table_id: 11, order: null, table_request_id: null, metadata: { recipient_user_id: recipient, previous_waiter_user_id: null, source: 'qr_entry' },
})

export async function installAssignmentFixture() {
  const originalAdapter = http.defaults.adapter, originalReverb = appConfig.reverb
  disconnectEcho(); appConfig.reverb = { key: 'fixture', host: '127.0.0.1', port: 1, tls: false }
  const echo = getEcho()!; echo.disconnect(); echo.connector.pusher.connection.state = 'connected'
  const channels = new Map<string, { listeners: Map<string, Set<(event: unknown) => void>>; subscribed: Set<() => void> }>()
  const leaves: string[] = []
  echo.private = ((name: string) => {
    if (!channels.has(name)) channels.set(name, { listeners: new Map(), subscribed: new Set() })
    const state = channels.get(name)!
    const channel = {
      subscription: { subscribed: true },
      subscribed(callback: () => void) { state.subscribed.add(callback); queueMicrotask(callback); return channel },
      error() { return channel },
      stopListening(event: string, callback: (event: unknown) => void) { state.listeners.get(event)?.delete(callback); return channel },
      listen(event: string, callback: (event: unknown) => void) {
        if (!state.listeners.has(event)) state.listeners.set(event, new Set())
        state.listeners.get(event)!.add(callback); return channel
      },
    }; return channel
  }) as typeof echo.private
  echo.leave = (name: string) => { leaves.push(name); channels.delete(name) }
  const pinia = createPinia(), auth = useAuthStore(pinia), restaurant = useRestaurantStore(pinia)
  auth.user = { id: 5, name: 'Waiter fixture', email: 'fixture@example.test', email_verified_at: null, created_at: '', updated_at: '' }
  auth.authContext = { user: { id: 5, name: 'Waiter fixture', email: 'fixture@example.test', status: 'active' },
    platform: { is_platform_admin: false, roles: [], permissions: [] }, organizations: [{ id: 1, name: 'Fixture', slug: 'fixture', status: 'active', roles: [], permissions: [],
      restaurants: [1, 2].map(id => ({ id, name: `Restaurant ${id}`, slug: `r${id}`, status: 'active', roles: [], permissions: ['serve_orders'], can_manage_table_structure: false })) }] }
  restaurant.currentRestaurantId = 1
  const records = ref([item()]), calls: { method?: string; url?: string; scope?: string }[] = []
  let read = 0, delay = 0
  http.defaults.adapter = async config => {
    calls.push({ method: config.method, url: config.url, scope: config.params?.scope })
    const data = config.url?.endsWith('/read') ? { data: { unread_count: 0, last_read_event_id: read = records.value[0]?.id ?? 0 } }
      : config.url?.endsWith('/unread-count') ? { data: { unread_count: records.value.filter(e => e.id > read).length, last_read_event_id: read } }
      : { data: { activity: records.value.map(e => ({ ...e })) }, meta: { unread_count: records.value.filter(e => e.id > read).length, last_read_event_id: read, per_page: 25, next_cursor: null, prev_cursor: null } }
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    return { config, status: 200, statusText: 'OK', headers: {}, data }
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }, { path: '/service', name: 'app-service', component: { render: () => null } }] })
  await router.push('/'); await router.isReady()
  const host = document.createElement('main'); host.className = 'p-4'; document.body.append(host)
  const readyEnabled = ref(true)
  let feed!: ReturnType<typeof useRestaurantActivity>
  let ready!: ReturnType<typeof useReadyOrderNotifications>
  const Child = { setup() { ready = useReadyOrderNotifications(); return () => null } }
  const app = createApp({ setup() {
    feed = useRestaurantActivity(() => restaurant.currentRestaurantId, () => true, () => false)
    return () => h('div', [h(ActivityBell), readyEnabled.value ? h(Child) : null])
  } }); app.use(pinia); app.use(i18n); app.use(router); app.mount(host); await settle()
  return { records, calls, auth, restaurant, leaves, router, readyEnabled, feed, get ready() { return ready }, setDelay(ms: number) { delay = ms },
    disconnect() { echo.connector.pusher.connection.emit('state_change', { current: 'disconnected' }) },
    listenerCount() { return [...(channels.get('user.5')?.listeners.values() ?? [])].reduce((count, listeners) => count + listeners.size, 0) },
    broadcast(event: RestaurantActivityEvent, restaurantId = 1) {
      channels.get('user.5')?.listeners.get('.restaurant.activity.created')?.forEach(cb => cb({ restaurant_id: restaurantId, activity: event }))
    },
    async cleanup() { useActivityPanelToggle().close(); app.unmount(); host.remove(); http.defaults.adapter = originalAdapter; disconnectEcho(); appConfig.reverb = originalReverb; await settle() },
  }
}

export async function runAssignmentChecks() {
  let checks = 0
  const check = (value: unknown, message: string) => { if (!value) throw Error(message); checks++ }
  const fixture = await installAssignmentFixture()
  try {
    check(fixture.calls.every(c => c.scope === 'assignments'), 'waiter reads only scoped durable activity')
    check(!!document.querySelector('button[aria-label]'), 'waiter has notification bell')
    fixture.broadcast(item(2)); fixture.broadcast(item(2)); await settle()
    check(fixture.feed.events.value.length === 1 && fixture.feed.unreadCount.value === 2, 'duplicate event produces one row and one unread increment')
    fixture.broadcast(item(3, 99)); fixture.broadcast(item(4), 2); await settle()
    check(fixture.feed.events.value.length === 1, 'foreign recipient and restaurant are ignored')
    await fixture.feed.openPanel()
    check(fixture.feed.events.value.length === 1 && fixture.feed.events.value[0]?.id === 1, 'reopen reconciles persistent server notification')
    fixture.readyEnabled.value = false; await settle()
    check(!fixture.leaves.includes('user.5'), 'removing ready-order consumer retains activity user channel')
    const bell = document.querySelector<HTMLButtonElement>('button[aria-label]')!; bell.click(); await settle()
    const open = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Abrir mesa')
    check(!!open && open.getBoundingClientRect().height >= 44, 'notification has touch-sized open table action')
    open!.click(); await settle()
    check(fixture.router.currentRoute.value.query.table === '11' && fixture.router.currentRoute.value.query.session === '50', 'notification links to current session/table')
    check(!document.querySelector('[role=dialog]'), 'opening table closes activity overlay')
    fixture.records.value.push(item(2))
    fixture.disconnect()
    await new Promise(resolve => setTimeout(resolve, 15_200)); await settle()
    check(fixture.feed.unreadCount.value === 1, 'offline fallback recovers a durable unread notification without an event')
    fixture.setDelay(100)
    const old = fixture.feed.openPanel()
    fixture.restaurant.currentRestaurantId = 2; await nextTick()
    fixture.restaurant.currentRestaurantId = 1; await nextTick()
    await old
    check(fixture.feed.events.value.length === 0, 'A B A rejects old activity page response')
    check(fixture.listenerCount() === 6, 'restaurant switches remove old domain and subscription listeners')
    await fixture.cleanup()
  } finally { if (document.querySelector('main')) await fixture.cleanup() }
  // Pure UI states across languages use the real row and design system.
  return { checks }
}

let previewApp: ReturnType<typeof createApp> | null = null
export async function renderAssignmentPreview(locale: 'es-ES' | 'ca-ES-valencia' | 'en-GB', pending = false) {
  previewApp?.unmount()
  document.querySelector('main')?.remove()
  i18n.global.locale.value = locale
  const host = document.createElement('main'); host.className = 'mx-auto max-w-xl p-4'; document.body.append(host)
  const event = pending ? { ...item(), type: 'table_session.assignment_pending' as const, metadata: { source: 'qr_entry' } } : item()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  const app = createApp({ render: () => h('ul', [h(ActivityEventItem, { event, locale, timezone: 'Europe/Madrid', currency: 'EUR', isLast: true })]) })
  app.use(createPinia()); app.use(i18n); app.use(router); app.mount(host); previewApp = app; await settle()
  return { text: host.textContent, overflow: document.documentElement.scrollWidth > innerWidth,
    buttonHeight: host.querySelector('button')?.getBoundingClientRect().height ?? 0 }
}
