import { createApp, h, nextTick, ref } from 'vue'
import { createPinia } from 'pinia'
import { AxiosError } from 'axios'
import { http } from '../src/api/http'
import { publicHttp } from '../src/api/public-http'
import { i18n, type AppLocale } from '../src/i18n'
import { useRestaurantStore } from '../src/stores/restaurant'
import { useAuthStore } from '../src/stores/auth'
import TableOrdersList from '../src/components/dashboard/table/TableOrdersList.vue'
import TableBillPanel from '../src/components/dashboard/table/TableBillPanel.vue'
import PublicOrderHistory from '../src/components/public/PublicOrderHistory.vue'
import { fixture as publicFixture } from './frontend-qr-entry.browser'
import { pendingOrder } from './frontend-approvals.browser'
import type { PublicTrackedOrder } from '../src/types/public-menu'

const pause = async (ms = 60) => { await new Promise(r => setTimeout(r, ms)); await nextTick() }
const click = (text: string) => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
  if (!button) throw Error(`Missing button: ${text}`)
  button.click()
}
let cleanupPreview: (() => void) | null = null
const tracked = (id: number, status = 'waiting_approval'): PublicTrackedOrder => ({
  id, order_number: `#${id}`, status, created_at: '2026-10-21T10:00:00Z', total: '23.75',
  items: [{ name: 'Arroz tradicional de verduras', quantity: 2, unit_price: '10.00', line_total: '23.75', modifiers: [{ group_name: 'Extras', name: 'Setas', price_delta: '1.25' }] }],
})

export async function runChecks() {
  let checks = 0
  const check = (condition: unknown, label: string) => { if (!condition) throw Error(label); checks++ }
  const pinia = createPinia(), restaurant = useRestaurantStore(pinia), auth = useAuthStore(pinia)
  restaurant.currentRestaurantId = 1
  auth.authContext = { user: { id: 1, name: 'Waiter', email: 'fixture@example.test', status: 'active' },
    platform: { is_platform_admin: false, roles: [], permissions: [] }, organizations: [{ id: 1, name: 'Tenant', slug: 'tenant', status: 'active', roles: [], permissions: [],
      restaurants: [1, 2].map(id => ({ id, name: 'Fixture', slug: `r${id}`, status: 'active', roles: [], permissions: ['approve_customer_orders', 'serve_orders'], can_manage_table_structure: false })) }] }
  const session = ref(11), refresh = ref({})
  const orders = [pendingOrder(6), pendingOrder(5), pendingOrder(4), pendingOrder(3), pendingOrder(2)]
  const original = http.defaults.adapter
  const calls: { url: string; method: string; before?: number }[] = []
  let failBill = false, delay = 0, failHistory = false
  const bill = { table_session_id: 11, status: 'occupied', payment_status: 'unpaid', table: { id: 1, name: 'Mesa 1' }, orders_total: '23.75', paid_total: '1.25', balance: '22.50', can_close: false,
    orders: [{ id: 6, billable: true, status: 'confirmed', total: '23.75', created_at: '2026-10-21', items: [tracked(6).items[0]] }],
    payments: [{ id: 1, method: 'cash', amount: '1.25', currency: 'EUR', reference: null, note: null, recorded_at: '2026-10-21', recorded_by: { id: 1, name: 'Waiter' } }] }
  http.defaults.adapter = async config => {
    const url = config.url ?? '', method = config.method ?? 'get'
    calls.push({ url, method, before: config.params?.before_id })
    const respond = (data: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })
    if (url.endsWith('/bill')) {
      if (failBill) throw new AxiosError('Offline', 'ERR_NETWORK', config)
      return respond({ data: bill })
    }
    if (method === 'post') {
      const order = orders.find(o => url.includes(`/${o.id}/`))!
      order.status = 'confirmed'
      return respond({ data: { order: { ...order } } })
    }
    const context = config.params?.table_session_id
    const rows = context === 11 ? orders.filter(o => !config.params?.before_id || o.id < config.params.before_id).slice(0, 2).map(o => ({ ...o })) : []
    await pause(delay)
    if (failHistory) throw new AxiosError('Offline', 'ERR_NETWORK', config)
    return respond({ data: { orders: rows }, meta: { next_before_id: rows.length === 2 ? rows[1]!.id : null } })
  }
  const host = document.createElement('main'); host.className = 'mx-auto max-w-md p-4'; document.body.append(host)
  let app = createApp({ render: () => h(TableOrdersList, { tableSessionId: session.value, currency: 'EUR', timezone: 'Europe/Madrid', refreshKey: refresh.value }) }).use(pinia).use(i18n)
  i18n.global.locale.value = 'en-GB'; app.mount(host)
  try {
    await pause(120)
    check(host.textContent?.includes('#A6') && !host.textContent?.includes('#A4'), 'history begins with first page')
    click(i18n.global.t('sessionHistory.loadMore')); await pause(120)
    check(host.textContent?.includes('#A4') && host.textContent?.includes('#A3'), 'load more retains first page')
    click(i18n.global.t('service.order.approve')); await pause(100)
    check(host.textContent?.includes('#A6') && host.textContent?.includes('Confirmed'), 'approval retains historical row')
    refresh.value = {}; await pause(200)
    check(host.textContent?.includes('#A3'), 'reconciliation refreshes all loaded pages')
    const texts = host.textContent ?? ''
    check(texts.split('#A6').length === 2, 'reconciliation has no duplicate row')
    delay = 100; refresh.value = {}; await pause(5)
    session.value = 22; await pause(10); session.value = 11; await pause(5); session.value = 22
    await pause(220)
    check(!host.textContent?.includes('#A6'), 'late A→B→A→B responses cannot populate another session')
    session.value = 11; delay = 0; await pause(120)
    failHistory = true; refresh.value = {}; await pause(100)
    check(!!host.querySelector('[role=alert]'), 'history error is explicit')
    failHistory = false; click(i18n.global.t('sessionHistory.retry')); await pause(120)
    check(host.textContent?.includes('#A6'), 'history retry recovers')
    app.unmount()
    app = createApp({ render: () => h(TableBillPanel, { tableSessionId: session.value, currency: 'EUR', canRecordPayments: false, refreshKey: refresh.value }) }).use(i18n)
    failBill = true; app.mount(host); await pause(100)
    check(!!host.querySelector('[role=alert]') && !host.textContent?.includes('0.00'), 'bill failure is never shown as zero')
    failBill = false; click(i18n.global.t('sessionHistory.retry')); await pause(100)
    check(host.textContent?.includes('22.50') && host.textContent?.includes('23.75') && host.textContent?.includes('1.25'), 'bill displays authoritative totals and partial payment')
    check(host.textContent?.includes('Setas') && host.textContent?.includes('Arroz'), 'bill displays item and modifier snapshots')
    check(!host.textContent?.includes(i18n.global.t('tableDrawer.bill.recordPayment')), 'read-only bill shows no charge controls')
    check(calls.filter(c => c.method === 'post').every(c => c.url.endsWith('/approve')), 'viewing account never pays or closes')
    session.value = 22; await pause(100)
    check(!host.textContent?.includes('22.50'), 'bill refuses mismatched session response')
  } finally { app.unmount(); host.remove(); http.defaults.adapter = original }

  const f = await publicFixture({ locale: 'en-GB' })
  const adapter = publicHttp.defaults.adapter
  let status = 'waiting_approval', reads = 0, current = 0, maxCurrent = 0, late = 0, readFailure = false
  publicHttp.defaults.adapter = async config => {
    if (config.url?.endsWith('/orders') && config.method === 'get') {
      reads++; current++; maxCurrent = Math.max(maxCurrent, current)
      const snapshot = tracked(42, status)
      await pause(late)
      current--
      if (readFailure) throw new AxiosError('Rate limit', 'ERR_BAD_RESPONSE', config, undefined, { config, status: 429, statusText: '', headers: { 'retry-after': '60' }, data: {} })
      return { config, status: 200, statusText: '', headers: {}, data: { data: { orders: [snapshot] }, meta: { next_before_id: null } } }
    }
    return (adapter as (c: typeof config) => Promise<unknown>)(config) as never
  }
  try {
    await f.state.publicHistory.refresh(); await pause()
    click(i18n.global.t('sessionHistory.publicTitle')); await pause(100)
    check(document.body.textContent?.includes(i18n.global.t('tableDrawer.orders.status.waiting_approval')), 'public waiting approval is distinct from kitchen acceptance')
    status = 'preparing'; await f.state.refreshTracking(); await pause()
    check(document.body.textContent?.includes(i18n.global.t('tableDrawer.orders.status.preparing')), 'same resolution scheduler updates public authoritative status')
    late = 80
    await Promise.all([f.state.refreshTracking(), f.state.refreshTracking(), f.state.refreshTracking()])
    check(maxCurrent === 1, 'public tracking coalesces concurrent refreshes')
    check(f.calls.filter(c => c.url.endsWith('/enter')).length === 1, 'tracking never enters another session')
    readFailure = true; await f.state.refreshTracking(); await pause()
    const before = reads
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); await pause(100)
    check(reads === before, 'focus and online respect Retry-After')
    check(!!document.querySelector('[role=alert]'), 'public history has visible retry error')
    const prior = reads
    await f.cleanup(); window.dispatchEvent(new Event('focus')); await pause(100)
    check(reads === prior, 'public tracking listeners are removed on unmount')
  } finally { publicHttp.defaults.adapter = adapter; await f.cleanup() }
  const retryFixture = await publicFixture()
  const retryAdapter = publicHttp.defaults.adapter
  let resolutionReads = 0
  publicHttp.defaults.adapter = async config => {
    if (config.url?.endsWith(`/tables/${retryFixture.qr}`)) {
      resolutionReads++
      throw new AxiosError('Rate limit', 'ERR_BAD_RESPONSE', config, undefined, { config, status: 429, statusText: '', headers: { 'retry-after': '60' }, data: {} })
    }
    return (retryAdapter as (c: typeof config) => Promise<unknown>)(config) as never
  }
  try {
    await retryFixture.state.reloadResolution()
    await retryFixture.state.reloadResolution()
    check(resolutionReads === 1, 'resolution manual retries also respect Retry-After')
  } finally { await retryFixture.cleanup() }
  return { checks }
}

export async function preview(locale: AppLocale, kind: 'public' | 'bill', state: 'success' | 'error' | 'loading' | 'empty' = 'success') {
  cleanupPreview?.()
  i18n.global.locale.value = locale
  const host = document.createElement('main'); host.className = 'mx-auto max-w-md p-4'; document.body.append(host)
  const original = http.defaults.adapter
  if (kind === 'bill') http.defaults.adapter = async config => {
    if (state === 'loading') await new Promise(resolve => config.signal?.addEventListener?.('abort', resolve))
    if (state === 'error') throw new AxiosError('Offline fixture', 'ERR_NETWORK', config)
    return { config, status: 200, statusText: '', headers: {}, data: { data: {
      table_session_id: 11, status: 'occupied', payment_status: 'unpaid', table: { id: 1, name: 'Mesa 1' },
      orders_total: state === 'empty' ? '0.00' : '23.75', paid_total: state === 'empty' ? '0.00' : '1.25', balance: state === 'empty' ? '0.00' : '22.50', can_close: false,
      orders: state === 'empty' ? [] : [{ id: 42, billable: true, status: 'served', total: '23.75', created_at: '2026-10-21', items: tracked(42).items }],
      payments: state === 'empty' ? [] : [{ id: 1, method: 'cash', amount: '1.25', currency: 'EUR', recorded_by: { id: 1, name: 'Waiter' } }],
    } } }
  }
  const app = createApp({ render: () => kind === 'bill'
    ? h(TableBillPanel, { tableSessionId: 11, currency: 'EUR', canRecordPayments: false })
    : h(PublicOrderHistory, { orders: state === 'loading' ? null : state === 'empty' ? [] : [tracked(42), tracked(41, 'served'), tracked(40, 'cancelled')], loading: state === 'loading', error: state === 'error' ? { kind: 'network' } : null, hasMore: state === 'success', locale }) }).use(i18n)
  app.mount(host)
  cleanupPreview = () => { app.unmount(); host.remove(); http.defaults.adapter = original }
  await pause()
  return { overflow: document.documentElement.scrollWidth > innerWidth, smallTargets: [...host.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length, missing: host.textContent?.includes('sessionHistory.') }
}
