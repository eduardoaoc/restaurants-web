/** Mounted production components + real services; fixture HTTP only, no backend writes. */
import { createApp, h, nextTick, ref, type Component } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { AxiosError } from 'axios'
import { http } from '../src/api/http'
import { appConfig } from '../src/config/runtime'
import { disconnectEcho, getEcho } from '../src/realtime/echo'
import { i18n } from '../src/i18n'
import { useAuthStore } from '../src/stores/auth'
import { useRestaurantStore } from '../src/stores/restaurant'
import { useOrderApprovals } from '../src/composables/useOrderApprovals'
import { usePermissions } from '../src/composables/usePermissions'
import ServiceView from '../src/views/service/ServiceView.vue'
import TableOrdersList from '../src/components/dashboard/table/TableOrdersList.vue'
import OrderDetailSheet from '../src/components/service/OrderDetailSheet.vue'
import type { Order } from '../src/types/orders'

const settle = async () => { await new Promise(resolve => setTimeout(resolve, 40)); await nextTick() }
export const pendingOrder = (id = 101, restaurantId = 1): Order => ({
  id, order_number: `#A${id}`, origin: 'customer_qr', status: 'waiting_approval',
  restaurant: { id: restaurantId, name: `Restaurant ${restaurantId}` }, table: { id: restaurantId * 10, name: 'Mesa 4' },
  customer_name: null, customer_note: 'Sin sal', subtotal: '32.40', modifiers_total: '0.00', total: '32.40',
  created_at: new Date(Date.now() - 180_000).toISOString(),
  items: [{ name: 'Arroz', description: null, quantity: 3, unit_price: '10.80', line_total: '32.40', note: null, modifiers: [] }],
})

export async function installFixture(mode: 'service' | 'table' | 'paired-table' | 'sheet' | 'composable' = 'service', realtime = false) {
  const originalReverb = appConfig.reverb
  disconnectEcho()
  appConfig.reverb = realtime ? { key: 'fixture', host: '127.0.0.1', port: 1, tls: false } : null
  const channels = new Map<string, Map<string, (event: unknown) => void>>()
  if (realtime) {
    const echo = getEcho()!
    echo.disconnect()
    echo.connector.pusher.connection.state = 'connected'
    echo.private = ((name: string) => {
      const listeners = new Map<string, (event: unknown) => void>()
      channels.set(name, listeners)
      const channel = {
        subscribed(callback: () => void) { queueMicrotask(callback); return channel },
        error() { return channel },
        stopListening(event: string) { listeners.delete(event); return channel },
        listen(event: string, callback: (event: unknown) => void) { listeners.set(event, callback); return channel },
      }
      return channel
    }) as typeof echo.private
    echo.leave = (name: string) => { channels.delete(name) }
  }
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const restaurant = useRestaurantStore(pinia)
  auth.authContext = {
    user: { id: 1, name: 'Waiter fixture', email: 'fixture@example.test', status: 'active' },
    platform: { is_platform_admin: false, roles: [], permissions: [] },
    organizations: [{ id: 1, name: 'Tenant fixture', slug: 'fixture', status: 'active', roles: [], permissions: [],
      restaurants: [1, 2].map(id => ({ id, name: `Restaurant ${id}`, slug: `r${id}`, status: 'active', roles: [],
        permissions: ['approve_customer_orders'], can_manage_table_structure: false })) }],
  }
  restaurant.currentRestaurantId = 1
  const records = ref<Order[]>([pendingOrder(), pendingOrder(202, 2)])
  const calls: { method: string; url: string; restaurantId?: number; status?: string }[] = []
  let failStatus: number | null = null
  let delay = 0
  let listDelay = 0
  let responseStatus: Order['status'] | null = null
  let networkFailure: 'before' | 'after' | null = null
  let failReads = false
  let detailDelay = 0
  const tableSessionId = ref(11)
  const sessionIds = new Map([[101, 11], [202, 22]])
  let approvedEvents = 0
  const originalAdapter = http.defaults.adapter
  http.defaults.adapter = async config => {
    const method = config.method ?? 'get'
    const url = config.url ?? ''
    calls.push({ method, url, restaurantId: config.params?.restaurant_id, status: config.params?.status })
    const response = (data: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })
    if (method === 'get' && failReads) throw new AxiosError('Offline', 'ERR_NETWORK', config)
    if (url.endsWith('/operations/live')) return response({ data: {
      restaurant: { id: restaurant.currentRestaurantId, name: 'Fixture', currency: 'EUR', timezone: 'Europe/Madrid' },
      floors: [], unassigned_tables: [], staff: [], alerts: [],
    } })
    if (url === '/api/v1/orders') {
      const snapshot = records.value.filter(order => (!config.params?.restaurant_id || order.restaurant.id === config.params.restaurant_id)
        && (!config.params?.status || order.status === config.params.status)
        && (!config.params?.table_session_id || sessionIds.get(order.id) === config.params.table_session_id))
      await new Promise(resolve => setTimeout(resolve, listDelay))
      return response({ data: { orders: snapshot } })
    }
    const id = Number(url.split('/')[4])
    if (method === 'post') {
      await new Promise(resolve => setTimeout(resolve, delay))
      if (failStatus) throw new AxiosError('Fixture failure', 'ERR_BAD_RESPONSE', config, undefined,
        { ...response({ message: 'Order cannot be changed.' }), status: failStatus })
      if (networkFailure === 'before') throw new AxiosError('Offline', 'ERR_NETWORK', config)
      const current = records.value.find(order => order.id === id)!
      const updated: Order = { ...current, status: responseStatus ?? (url.endsWith('/approve') ? 'confirmed' : 'cancelled') }
      records.value = records.value.map(order => order.id === id ? updated : order)
      if (networkFailure === 'after') throw new AxiosError('Response lost after commit', 'ERR_NETWORK', config)
      return response({ data: { order: updated } })
    }
    const snapshot = records.value.find(order => order.id === id)
    await new Promise(resolve => setTimeout(resolve, detailDelay))
    return response({ data: { order: snapshot } })
  }
  const host = document.createElement('main')
  host.className = 'mx-auto max-w-3xl p-4'
  document.body.append(host)
  let approvals: ReturnType<typeof useOrderApprovals> | undefined
  let component: Component = ServiceView
  const refreshKey = ref<object>({})
  if (mode === 'table') component = { render: () => h(TableOrdersList, { tableSessionId: tableSessionId.value, refreshKey: refreshKey.value, currency: 'EUR', timezone: 'Europe/Madrid', onApproved: () => { ++approvedEvents } }) }
  if (mode === 'paired-table') component = { render: () => h('div', [0, 1].map(key => h(TableOrdersList, { key, tableSessionId: 11, currency: 'EUR', timezone: 'Europe/Madrid' }))) }
  if (mode === 'sheet') component = { render: () => h(OrderDetailSheet, { order: records.value[0]!, currency: 'EUR', approving: false, rejecting: false, actionError: null }) }
  if (mode === 'composable') component = { setup() { const { can } = usePermissions(); approvals = useOrderApprovals(() => can('approve_customer_orders')); return () => null } }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }] })
  await router.push('/')
  i18n.global.locale.value = 'es-ES'
  const app = createApp({ render: () => h(component) }).use(pinia).use(i18n).use(router)
  app.mount(host)
  await settle()
  return {
    calls, records, auth, restaurant, refreshKey, get approvals() { return approvals! },
    setFailure(status: number | null) { failStatus = status },
    setNetworkFailure(value: typeof networkFailure) { networkFailure = value },
    setFailReads(value: boolean) { failReads = value },
    setDetailDelay(ms: number) { detailDelay = ms },
    tableSessionId, sessionIds,
    setResponseStatus(status: Order['status']) { responseStatus = status },
    get approvedEvents() { return approvedEvents },
    setDelay(ms: number) { delay = ms }, setListDelay(ms: number) { listDelay = ms },
    broadcast(name: string, restaurantId = restaurant.currentRestaurantId) {
      channels.get(`restaurant.${restaurantId}`)?.get(`.${name}`)?.({ restaurant_id: restaurantId, schema_version: 1, event_id: crypto.randomUUID(), occurred_at: new Date().toISOString() })
    },
    async cleanup() { app.unmount(); host.remove(); http.defaults.adapter = originalAdapter; disconnectEcho(); appConfig.reverb = originalReverb; await nextTick() },
  }
}

const buttons = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent?.trim() === text)
const posts = (fixture: Awaited<ReturnType<typeof installFixture>>) => fixture.calls.filter(call => call.method === 'post')

export async function runApprovalChecks() {
  const passed: string[] = []
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); passed.push(label) }
  let fixture = await installFixture()
  try {
    check(document.body.textContent?.includes('#A101') && !document.body.textContent?.includes('#A202'), 'authorized waiter sees only active restaurant pending orders')
    check(buttons('Aprobar').length === 1, 'explicit approval CTA in Servicio')
    check(document.body.textContent?.includes('3 productos'), 'item count sums quantities')
    check(fixture.calls.some(call => call.restaurantId === 1 && call.status === 'waiting_approval'), 'queue GET sends restaurant_id and waiting_approval')
    fixture.setDelay(150)
    const approve = buttons('Aprobar')[0]!
    approve.click(); approve.click()
    await settle()
    check(approve.disabled && approve.getAttribute('aria-busy') === 'true', 'per-order loading disables action')
    check(posts(fixture).length === 1 && posts(fixture)[0]?.url === '/api/v1/orders/101/approve', 'double-click sends exactly one POST /approve')
    await new Promise(resolve => setTimeout(resolve, 180)); await settle()
    check(buttons('Aprobar').length === 0 && !document.body.textContent?.includes('#A101'), 'authoritative success removes pending order')
    check(fixture.records.value[0]?.status === 'confirmed', 'waiter approval is confirmed, never kitchen accepted')
    await fixture.cleanup()

    fixture = await installFixture()
    buttons('Ver pedido')[0]!.click(); await settle()
    check(!!document.querySelector('[role=dialog]'), 'view order opens full detail')
    buttons('Rechazar')[0]!.click(); await settle()
    check(posts(fixture).length === 0 && buttons('Sí, rechazar pedido').length === 1, 'reject requires confirmation in the footer')
    buttons('Cancelar')[0]!.click(); await settle()
    check(buttons('Aprobar').length === 2, 'cancel reject restores existing approval action')
    buttons('Rechazar')[0]!.click(); await settle()
    buttons('Sí, rechazar pedido')[0]!.click(); await settle()
    check(posts(fixture).length === 1 && posts(fixture)[0]?.url.endsWith('/reject'), 'reject still calls existing endpoint once')
    check(fixture.records.value[0]?.status === 'cancelled' && !document.querySelector('[role=dialog]'), 'reject response removes pending and closes sheet')
    await fixture.cleanup()

    for (const status of [409, 404, 403, 401, 419]) {
      fixture = await installFixture('composable')
      fixture.setFailure(status)
      const previousGets = fixture.calls.filter(call => call.method === 'get').length
      if (status === 409 || status === 404) fixture.records.value[0] = { ...fixture.records.value[0]!, status: 'confirmed' }
      const result = await fixture.approvals.approve(101)
      check(result?.status === status, `${status} remains an API error`)
      check(fixture.calls.filter(call => call.method === 'get').length === previousGets + ([409, 404].includes(status) ? 1 : 0), `${status} refetch/retry policy`)
      check(posts(fixture).length === 1, `${status} never retries POST`)
      if (status === 409 || status === 404) check(fixture.approvals.orders.value.length === 0, `${status} refresh reconciles authoritative state`)
      else check(fixture.approvals.orders.value.length === 1, `${status} does not invent success`)
      await fixture.cleanup()
    }

    fixture = await installFixture('composable')
    fixture.setDelay(150)
    const oldAction = fixture.approvals.approve(101)
    fixture.restaurant.currentRestaurantId = 2
    check(fixture.approvals.orders.value.length === 0 && !fixture.approvals.actingOn[101], 'A to B synchronously clears pending and loading')
    await settle()
    check(fixture.approvals.orders.value[0]?.id === 202, 'B loads its own queue')
    await oldAction
    check(fixture.approvals.orders.value[0]?.id === 202 && !fixture.approvals.actionError[101], 'late A POST cannot change B or leak errors')
    const beforeInvalid = posts(fixture).length
    await fixture.approvals.approve(101)
    check(posts(fixture).length === beforeInvalid, 'cannot act on foreign or missing order')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.setListDelay(150)
    const oldGet = fixture.approvals.refetch()
    fixture.setListDelay(0)
    await fixture.approvals.approve(101)
    await oldGet
    check(fixture.approvals.orders.value.length === 0, 'pre-approval GET cannot resurrect an approved order')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.records.value.push(pendingOrder(303))
    await fixture.approvals.refetch()
    fixture.setDelay(120)
    const first = fixture.approvals.approve(101), duplicate = fixture.approvals.reject(101), other = fixture.approvals.approve(303)
    check(fixture.approvals.actingOn[101] === 'approve' && fixture.approvals.actingOn[303] === 'approve', 'loading is independent per order')
    await Promise.all([first, duplicate, other])
    check(posts(fixture).length === 2 && !posts(fixture).some(call => call.url.endsWith('/reject')), 'same-order approve/reject collision sends no second POST')
    check(fixture.approvals.orders.value.length === 0, 'concurrent different-order successes remain removed')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.setResponseStatus('waiting_approval')
    await fixture.approvals.approve(101)
    check(fixture.approvals.orders.value[0]?.status === 'waiting_approval', 'response status is authoritative even if it remains pending')
    await fixture.cleanup()

    fixture = await installFixture('table')
    const pendingReads = fixture.calls.filter(call => call.status === 'waiting_approval').length
    fixture.records.value[0] = { ...fixture.records.value[0]!, status: 'confirmed' }
    fixture.refreshKey.value = {}; await settle()
    check(document.body.textContent?.includes('Confirmado') && buttons('Aprobar').length === 0, 'drawer refresh reconciles session history')
    check(fixture.calls.filter(call => call.status === 'waiting_approval').length === pendingReads, 'drawer refresh does not duplicate the parent pending queue read')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.auth.authContext!.organizations[0]!.restaurants[0]!.permissions = []
    await nextTick()
    await fixture.approvals.approve(pendingOrder())
    check(posts(fixture).length === 0 && fixture.approvals.orders.value.length === 0, 'permission loss blocks mutation even with an old order snapshot')
    check(fixture.auth.authContext!.organizations[0]!.restaurants[1]!.permissions.includes('approve_customer_orders'), 'permission on B does not authorize A')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.setListDelay(150)
    const oldA = fixture.approvals.refetch()
    fixture.restaurant.currentRestaurantId = 2
    fixture.setListDelay(0)
    fixture.records.value = [pendingOrder(303), pendingOrder(202, 2)]
    fixture.restaurant.currentRestaurantId = 1
    await oldA; await settle()
    check(fixture.approvals.orders.value[0]?.id === 303, 'A to B to A ignores the first A response')
    await fixture.cleanup()

    fixture = await installFixture('service', true)
    await new Promise(resolve => setTimeout(resolve, 320))
    buttons('Ver pedido')[0]!.click(); await settle()
    fixture.records.value[0] = { ...fixture.records.value[0]!, status: 'confirmed' }
    fixture.broadcast('order.status_changed')
    await new Promise(resolve => setTimeout(resolve, 320)); await settle()
    check(!document.querySelector('[role=dialog]') && buttons('Aprobar').length === 0, 'realtime status change closes stale detail and removes pending')
    fixture.records.value.push(pendingOrder(303))
    fixture.broadcast('order.created'); fixture.broadcast('order.created')
    await new Promise(resolve => setTimeout(resolve, 320)); await settle()
    check(buttons('Aprobar').length === 1 && document.body.textContent?.includes('#A303'), 'realtime new QR order appears once without manual refresh')
    fixture.restaurant.currentRestaurantId = 2; await settle()
    const previousCalls = fixture.calls.length
    fixture.broadcast('order.created', 1)
    await new Promise(resolve => setTimeout(resolve, 320))
    check(fixture.calls.length === previousCalls + 1, 'restaurant switch leaves A channel; only B subscription catch-up runs')
    await fixture.cleanup()

    fixture = await installFixture()
    fixture.records.value.push(pendingOrder(303))
    buttons('Actualizar')[0]!.click(); await new Promise(resolve => setTimeout(resolve, 300)); await settle()
    check(buttons('Aprobar').length === 2, 'manual refetch fallback works without realtime')
    await fixture.cleanup()

    for (const mode of ['service', 'table', 'sheet'] as const) {
      fixture = await installFixture(mode)
      fixture.auth.authContext!.organizations[0]!.restaurants[0]!.permissions = []
      await settle()
      check(buttons('Aprobar').length === 0, `${mode}: no permission means no approval CTA`)
      await fixture.cleanup()
    }
    for (const status of ['confirmed', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'cancelled'] as const) {
      fixture = await installFixture('sheet')
      fixture.records.value[0] = { ...fixture.records.value[0]!, status }
      await settle()
      check(buttons('Aprobar').length === 0, `sheet: ${status} is not approvable`)
      await fixture.cleanup()
    }
    fixture = await installFixture('sheet')
    fixture.restaurant.currentRestaurantId = 2; await settle()
    check(buttons('Aprobar').length === 0, 'sheet: foreign restaurant never shows approval')
    fixture.restaurant.currentRestaurantId = 1
    fixture.records.value[0] = { ...fixture.records.value[0]!, origin: 'waiter' }; await settle()
    check(buttons('Aprobar').length === 0, 'sheet: staff origin never shows customer approval')
    await fixture.cleanup()

    fixture = await installFixture('table')
    check(buttons('Aprobar').length === 1, 'table list exposes existing approval action')
    document.querySelector<HTMLButtonElement>('button[aria-label*="#A101"]')!.click(); await settle()
    check(buttons('Aprobar').length === 1, 'table detail exposes the same approval action')
    buttons('Aprobar')[0]!.click(); await settle()
    check(posts(fixture).length === 1 && buttons('Aprobar').length === 0, 'table detail approval uses one POST and authoritative status')
    check(fixture.approvedEvents === 1, 'table approval notifies operational parent once')
    await fixture.cleanup()

    fixture = await installFixture('paired-table')
    fixture.setDelay(150)
    for (const button of buttons('Aprobar')) button.click()
    await settle()
    check(posts(fixture).length === 1, 'two mounted approval surfaces share one in-flight POST per order')
    check(buttons('Aprobar').every(button => button.disabled), 'same-order loading disables every mounted approval surface')
    await new Promise(resolve => setTimeout(resolve, 180)); await fixture.cleanup()

    fixture = await installFixture('paired-table')
    fixture.setNetworkFailure('before'); fixture.setFailReads(true)
    buttons('Aprobar')[0]!.click(); await settle(); await settle()
    buttons('Aprobar')[1]!.click(); await settle(); await settle()
    check(posts(fixture).length === 1, 'another surface must reconcile an uncertain POST before writing')
    fixture.setNetworkFailure(null); fixture.setFailReads(false)
    buttons('Aprobar')[1]!.click(); await settle(); await settle()
    check(posts(fixture).length === 2 && fixture.records.value[0]?.status === 'confirmed', 'another surface can retry after authoritative reconciliation succeeds')
    await fixture.cleanup()

    for (const status of [404, 409]) {
      fixture = await installFixture('table')
      fixture.records.value[0] = { ...fixture.records.value[0]!, status: 'confirmed' }
      fixture.setFailure(status)
      buttons('Aprobar')[0]!.click(); await settle(); await settle()
      check(buttons('Aprobar').length === 0 && document.body.textContent?.includes('Confirmado'), `table ${status} refetches authoritative session history`)
      await fixture.cleanup()
    }

    fixture = await installFixture('composable')
    fixture.setNetworkFailure('after')
    const lostResponse = await fixture.approvals.approve(101)
    check(lostResponse?.kind === 'network', 'lost response remains a network error')
    check(fixture.approvals.orders.value.length === 0, 'lost response reconciles committed approval before retry')
    await fixture.approvals.approve(pendingOrder())
    check(posts(fixture).length === 1, 'old snapshot cannot repeat an approval reconciled as confirmed')
    await fixture.cleanup()

    fixture = await installFixture('service')
    fixture.auth.authContext!.organizations[0]!.restaurants[0]!.permissions.push('view_operations')
    await settle()
    fixture.setNetworkFailure('after')
    const previousOperations = fixture.calls.filter(call => call.url.includes('/operations/')).length
    buttons('Aprobar')[0]!.click(); await settle(); await settle()
    await new Promise(resolve => setTimeout(resolve, 300)); await settle()
    check(fixture.calls.filter(call => call.url.includes('/operations/')).length > previousOperations, 'network reconciliation refreshes Servicio operational data')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.setNetworkFailure('after')
    await fixture.approvals.reject(101)
    check(fixture.approvals.orders.value.length === 0 && fixture.records.value[0]?.status === 'cancelled', 'lost rejection response reconciles cancellation without another POST')
    await fixture.cleanup()

    fixture = await installFixture('composable')
    fixture.setNetworkFailure('before'); fixture.setFailReads(true)
    await fixture.approvals.approve(101)
    await fixture.approvals.reject(101)
    check(posts(fixture).length === 1, 'failed reconciliation prevents another POST including reject')
    fixture.setNetworkFailure(null); fixture.setFailReads(false)
    await fixture.approvals.approve(101)
    check(posts(fixture).length === 2 && fixture.approvals.orders.value.length === 0, 'retry first reconciles pending order then approves once')
    await fixture.cleanup()

    fixture = await installFixture('table')
    fixture.setNetworkFailure('after')
    buttons('Aprobar')[0]!.click(); await settle(); await settle()
    check(document.body.textContent?.includes('#A101') && document.body.textContent?.includes('Confirmado'), 'lost response keeps confirmed order in session history')
    check(buttons('Aprobar').length === 0 && fixture.approvedEvents === 1, 'reconciled response updates table and operational parent')
    await fixture.cleanup()

    fixture = await installFixture('table')
    fixture.records.value.push(pendingOrder(303))
    fixture.sessionIds.set(303, 33)
    fixture.tableSessionId.value = 33; await settle()
    check(!document.body.textContent?.includes('#A101') && document.body.textContent?.includes('#A303'), 'session filter excludes orders from previous session')
    fixture.setDetailDelay(150)
    document.querySelector<HTMLButtonElement>('button[aria-label*="#A303"]')!.click(); await settle()
    fixture.tableSessionId.value = 11
    await settle(); await new Promise(resolve => setTimeout(resolve, 180)); await settle()
    check(!document.body.textContent?.includes('#A303') && document.body.textContent?.includes('#A101'), 'late detail from previous session is discarded')
    fixture.setDetailDelay(0); fixture.setDelay(150)
    buttons('Aprobar')[0]!.click(); await settle()
    fixture.tableSessionId.value = 33; await settle()
    await new Promise(resolve => setTimeout(resolve, 180)); await settle()
    check(fixture.approvedEvents === 0 && document.body.textContent?.includes('#A303'), 'late approval from previous session cannot update current table')
    await fixture.cleanup()
    return { checks: passed.length, passed }
  } finally { await fixture.cleanup() }
}

export async function checkResponsive(width: number, height: number, theme: string) {
  const fixture = await installFixture()
  ;(window as unknown as { fixture: typeof fixture }).fixture = fixture
  const measurements: unknown[] = []
  for (const locale of ['es-ES', 'ca-ES-valencia', 'en-GB'] as const) {
    i18n.global.locale.value = locale
    await settle()
    const label = i18n.global.t('service.order.approve')
    const button = buttons(label)[0]!
    const box = button.getBoundingClientRect()
    if (box.height < 44 || box.width < 44 || box.right > width || box.bottom > height || document.documentElement.scrollWidth > width) throw new Error(`CTA bounds: ${width}/${theme}/${locale}`)
    measurements.push({ locale, list: { x: box.x, y: box.y, width: box.width, height: box.height } })
  }
  i18n.global.locale.value = 'es-ES'
  await nextTick()
  // Long order exercises the actual shared footer and body overflow.
  fixture.records.value[0]!.items = Array.from({ length: 30 }, () => ({ ...pendingOrder().items[0]! }))
  buttons('Actualizar')[0]!.click(); await new Promise(resolve => setTimeout(resolve, 300)); await settle()
  buttons('Ver pedido')[0]!.click(); await new Promise(resolve => setTimeout(resolve, 300)); await nextTick()
  const button = document.querySelector<HTMLButtonElement>('[role=dialog] button.bg-primary')!
  const box = button.getBoundingClientRect()
  const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
  if (box.height < 44 || box.bottom > height || box.y < 0 || !button.contains(hit)) throw new Error(`Footer obscured: ${width}/${theme}`)
  button.focus()
  if (document.activeElement !== button || !button.matches(':focus-visible')) throw new Error('Approval keyboard focus unavailable')
  button.click(); await settle()
  if (posts(fixture).length !== 1) throw new Error('Responsive CTA not actionable')
  // Re-open for screenshot, retaining the same long-order fixture.
  fixture.records.value[0] = { ...fixture.records.value[0]!, id: 404, order_number: '#A404', status: 'waiting_approval' }
  buttons('Actualizar')[0]!.click(); await new Promise(resolve => setTimeout(resolve, 300)); await settle()
  buttons('Ver pedido')[0]!.click(); await new Promise(resolve => setTimeout(resolve, 300))
  return { width, height, theme, measurements, footer: { x: box.x, y: box.y, width: box.width, height: box.height }, checks: 6 }
}
