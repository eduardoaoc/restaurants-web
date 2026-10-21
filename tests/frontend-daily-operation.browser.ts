/** Production views/components/services, controlled HTTP and private Echo transport. */
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { AxiosError, getAdapter } from 'axios'
import { http } from '../src/api/http'
import { publicHttp } from '../src/api/public-http'
import { i18n, type AppLocale } from '../src/i18n'
import { appConfig } from '../src/config/runtime'
import { getEcho, disconnectEcho } from '../src/realtime/echo'
import { useAuthStore } from '../src/stores/auth'
import { useRestaurantStore } from '../src/stores/restaurant'
import DayCloseView from '../src/views/day-close/DayCloseView.vue'
import DailyOperationBanner from '../src/components/shared/DailyOperationBanner.vue'
import QuickMetrics from '../src/components/dashboard/operation/QuickMetrics.vue'
import { fixture as publicFixture } from './frontend-qr-entry.browser'
import type { DailyOperationState } from '../src/types/daily-operation'
import type { RestaurantProduct } from '../src/types/product'
import type { OperationsSummary } from '../src/types/operations'
import { parseMoneyInput } from '../src/utils/price'
import previewFixture from './frontend-daily-operation.preview.json'

const pause = async (ms = 70) => { await new Promise(r => setTimeout(r, ms)); await nextTick() }
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')]
function button(text: string) {
  const b = buttons().find(b => b.textContent?.trim() === text)
  if (!b) throw Error(`Missing ${text}`)
  return b
}
const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {})
const row = (id: number, available: boolean): RestaurantProduct => ({ id, restaurant_id: 1, product_id: id, price: '12.50', available, created_at: '', updated_at: '', product: { id, organization_id: 1, internal_name: `Arroz ${id}`, status: 'active', sku: null, translations: [{ locale: 'es', name: `Arroz tradicional ${id}`, description: 'Arroz local' }], allergens: [], nutrition: null, media: { image: null, video: null }, created_at: '', updated_at: '' } })

const notOpen = (canOpen = true): DailyOperationState => ({
  status: 'not_open', current: null, last_close: { business_date: '2026-10-21', closed_at: '2026-10-21T22:00:00Z' }, next_business_date: '2026-10-22',
  can: { open: canOpen, close: true }, cash: { currency: 'EUR', suggested_opening_float: '80.00', suggested_opening_float_source: 'previous_close' },
})
const open = (float: string, restaurant = 1): DailyOperationState => ({
  status: 'open', last_close: null, next_business_date: null, can: { open: true, close: true },
  current: { id: `op-${restaurant}`, status: 'open', business_date: '2026-10-22', timezone: 'Europe/Madrid', opened_at: '2026-10-22T08:00:00Z', opened_by: { name: `Encargada ${restaurant}` }, closed_at: null, closed_by: null },
  cash: { currency: 'EUR', opening_float: float, received: '12.00', cash_received: '12.00', payments_count: 1, sessions_opened: 1, suggested_opening_float: '80.00', suggested_opening_float_source: 'previous_close' },
})

async function staffFixture(permissions: string[], initiallyOpen = false) {
  const oldHttp = http.defaults.adapter, oldReverb = appConfig.reverb
  disconnectEcho(); appConfig.reverb = { key: 'fixture', host: '127.0.0.1', port: 1, tls: false }
  const echo = getEcho()!; echo.disconnect(); echo.connector.pusher.connection.state = 'connected'
  const callbacks = new Map<string, Map<string, Set<(e: unknown) => void>>>()
  echo.private = ((name: string) => {
    if (!callbacks.has(name)) callbacks.set(name, new Map())
    const events = callbacks.get(name)!
    const channel = { subscribed(cb: () => void) { queueMicrotask(cb); return channel }, error() { return channel },
      listen(name: string, cb: (e: unknown) => void) { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(cb); return channel },
      stopListening(name: string, cb: (e: unknown) => void) { events.get(name)?.delete(cb); return channel } }
    return channel
  }) as typeof echo.private
  echo.leave = name => { callbacks.delete(name) }
  const pinia = createPinia(), auth = useAuthStore(pinia), restaurant = useRestaurantStore(pinia)
  const contexts = [1, 2].map(id => ({ id, name: `Restaurante ${id}`, slug: `r${id}`, status: 'active', roles: [], permissions, can_manage_table_structure: false }))
  auth.authContext = { user: { id: 5, name: 'Encargada', email: 'fixture@example.test', status: 'active' }, platform: { is_platform_admin: false, roles: [], permissions: [] }, organizations: [{ id: 1, name: 'Tenant', slug: 'tenant', status: 'active', roles: [], permissions: [], restaurants: contexts }] }
  restaurant.currentRestaurantId = 1
  const states = new Map<number, DailyOperationState>([[1, initiallyOpen ? open('100.00') : notOpen(permissions.includes('open_daily_operation'))], [2, open('5.00', 2)]])
  const readDelay = new Map<number, number>()
  let postMode: 'ok' | 'network' | 'conflict' = 'ok'
  const calls: { url: string; method: string; key?: string; body?: unknown }[] = []
  const fail = (config: Parameters<NonNullable<typeof http.defaults.adapter> & ((c: never) => unknown)>[0], status: number, data: unknown) =>
    new AxiosError('fixture', 'ERR_BAD_RESPONSE', config as never, undefined, { config: config as never, status, statusText: '', headers: {}, data })
  http.defaults.adapter = async config => {
    const url = config.url ?? '', method = config.method ?? 'get', id = Number(url.match(/restaurants\/(\d+)/)?.[1])
    calls.push({ url, method, key: config.headers?.['Idempotency-Key'] as string | undefined, body: config.data ? JSON.parse(config.data) : undefined })
    const respond = (data: unknown) => ({ config, status: 200, statusText: '', headers: {}, data: { data } })
    if (url.endsWith('/daily-operation')) {
      await pause(readDelay.get(id) ?? 0)
      return respond(structuredClone(states.get(id)))
    }
    if (url.endsWith('/daily-operations')) {
      await pause(120)
      if (postMode === 'network') throw new AxiosError('offline', 'ERR_NETWORK', config)
      if (postMode === 'conflict') { states.set(id, open('20.00')); throw fail(config as never, 409, { error: { code: 'DAILY_OPERATION_ALREADY_OPEN', message: 'open' } }) }
      states.set(id, open(JSON.parse(config.data).opening_float))
      return { ...respond(states.get(id)), status: 201 }
    }
    if (url.endsWith('/products')) return respond({ restaurant_products: [row(1, false), row(2, true)] })
    if (url.endsWith('/day-close/preview') && states.get(id)?.status === 'open') return respond(structuredClone(previewFixture))
    // The body is what matters here; the close itself is covered by the API suite.
    if (url.endsWith('/day-closes') && method === 'post') throw fail(config as never, 503, { message: 'fixture stops after capturing the payload' })
    throw fail(config as never, 503, { message: 'not part of this fixture' })
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'app-day-close', component: { render: () => null } },
    { path: '/d/:id', name: 'app-day-close-detail', component: { render: () => null } },
  ] })
  await router.push('/')
  const host = document.createElement('main'); host.className = 'p-4'; document.body.append(host)
  const app = createApp(DayCloseView).use(pinia).use(i18n).use(router); app.mount(host); await pause(300)
  return { host, restaurant, calls, states, readDelay, postMode(mode: typeof postMode) { postMode = mode },
    broadcast(id: string) { callbacks.get(`restaurant.${restaurant.currentRestaurantId}`)?.get('.daily_operation.changed')?.forEach(cb => cb({ event_id: id, restaurant_id: restaurant.currentRestaurantId, schema_version: 1, occurred_at: '', daily_operation_id: 'x', status: 'open', business_date: '2026-10-22' })) },
    async cleanup() { app.unmount(); host.remove(); disconnectEcho(); appConfig.reverb = oldReverb; http.defaults.adapter = oldHttp; await pause() } }
}

function inputByLabel(host: HTMLElement, label: string) {
  const l = [...host.querySelectorAll('label')].find(l => l.textContent?.replace('*', '').trim() === label)
  const input = l && (host.querySelector<HTMLInputElement>(`#${CSS.escape(l.htmlFor)}`) ?? l.querySelector('input'))
  if (!input) throw Error(`Missing input ${label}`)
  return input as HTMLInputElement
}
function type(input: HTMLInputElement, value: string) { input.value = value; input.dispatchEvent(new Event('input')) }

function setFloat(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input[name="opening_float"]')
  if (!input) throw Error('Missing opening float input')
  input.value = value; input.dispatchEvent(new Event('input'))
}

export async function runChecks() {
  let checks = 0
  const check = (value: unknown, message: string) => { if (!value) throw Error(message); checks++ }
  i18n.global.locale.value = 'en-GB'

  let f = await staffFixture(['close_daily_operation'])
  try {
    check(f.host.textContent?.includes(t('dailyOperation.notOpenStaff')) && !f.host.querySelector('input[name="opening_float"]'), 'without open_daily_operation: state + guidance, no form')
    check(!f.calls.some(c => c.url.endsWith('/day-close/preview')), 'close flow not loaded while the day is not open')
  } finally { await f.cleanup() }

  f = await staffFixture(['open_daily_operation', 'close_daily_operation', 'manage_product_availability'])
  try {
    const input = f.host.querySelector<HTMLInputElement>('input[name="opening_float"]')
    check(input?.value === '80.00' && f.host.textContent?.includes('left at the last close'), 'float prefilled with backend suggestion and its source')
    check(f.host.textContent?.includes('Arroz tradicional 1') && f.host.textContent?.includes(t('availability.soldOut')), 'availability review shows current sold-out state before opening')
    for (const bad of ['-1', '10.555', 'abc', '50000.01']) {
      setFloat(f.host, bad); await pause(20)
      check(button(t('dailyOperation.openCta')).disabled, `invalid float blocks opening: ${bad}`)
    }
    f.postMode('network'); setFloat(f.host, '12,5'); await pause(20)
    const cta = button(t('dailyOperation.openCta')); cta.click(); cta.click(); await pause(30)
    check(f.calls.filter(c => c.method === 'post').length === 1, 'double click sends one opening')
    await pause(250)
    check(!!f.host.querySelector('[role="alert"]') && f.host.textContent?.includes(t('dailyOperation.notOpen')), 'network failure keeps the honest not-open state')
    f.postMode('ok'); button(t('dailyOperation.openCta')).click(); await pause(300)
    const posts = f.calls.filter(c => c.method === 'post')
    check(posts.length === 2 && posts[0].key && posts[0].key === posts[1].key, 'retry of the same float reuses the Idempotency-Key')
    check((posts[1].body as { opening_float: string }).opening_float === '12.50', 'comma input normalized to a decimal string')
    check(!f.calls.some(c => c.method === 'patch'), 'opening never rewrites availability')
    check(f.host.textContent?.includes(t('dailyOperation.openState', { date: '' }).split('·')[0].trim()) && f.host.textContent?.includes('Encargada 1'), 'authoritative open state shown')
    check(f.host.textContent?.includes('12.50') && f.host.textContent?.includes('12.00') && f.host.textContent?.includes(t('dailyOperation.floatNotSales')), 'opening float and receipts shown separately')
    check(f.calls.some(c => c.url.endsWith('/day-close/preview')), 'existing close flow loads once the day is open')

    const reads = f.calls.filter(c => c.url.endsWith('/daily-operation')).length
    f.broadcast('e1'); f.broadcast('e1'); f.broadcast('e2'); await pause(450)
    const after = f.calls.filter(c => c.url.endsWith('/daily-operation')).length
    check(after > reads && after <= reads + 2, `realtime events coalesce into authoritative reads (${reads} -> ${after})`)

    f.readDelay.set(1, 500); f.broadcast('slow'); await pause(80)
    f.restaurant.currentRestaurantId = 2; await pause(250)
    check(f.host.textContent?.includes('Encargada 2'), 'restaurant switch loads the new restaurant state')
    await pause(500)
    check(f.host.textContent?.includes('Encargada 2') && !f.host.textContent?.includes('Encargada 1'), 'stale response of the previous restaurant is discarded')
  } finally { await f.cleanup() }

  f = await staffFixture(['open_daily_operation', 'close_daily_operation'])
  try {
    f.postMode('conflict'); setFloat(f.host, '30'); await pause(20)
    const readsBefore = f.calls.filter(c => c.url.endsWith('/daily-operation')).length
    button(t('dailyOperation.openCta')).click(); await pause(400)
    check(f.calls.filter(c => c.url.endsWith('/daily-operation')).length === readsBefore + 1 && f.host.textContent?.includes('20.00'), 'already-open conflict refetches and shows the real day, never a second float')
  } finally { await f.cleanup() }

  // Cierre amounts: "100,00" and "100.00" are the same canonical decimal.
  const cases: [string, string | null][] = [['100,00', '100.00'], ['100.00', '100.00'], ['100,5', '100.50'], ['0', '0.00'], ['007,1', '7.10'],
    ['', null], ['  ', null], ['-5', null], ['1.000,00', null], ['1,000.00', null], ['10.555', null], ['1 000', null], ['abc', null], ['12,', null], ['123456789', null]]
  for (const [raw, expected] of cases) check(parseMoneyInput(raw) === expected, `parseMoneyInput(${JSON.stringify(raw)}) === ${expected}`)

  f = await staffFixture(['open_daily_operation', 'close_daily_operation'], true)
  try {
    await pause(300)
    const counted = inputByLabel(f.host, t('dayClose.cash.countedCashLabel'))
    const review = () => button(t('dayClose.review.cta'))
    check(review().disabled && !f.host.textContent?.includes(t('dayClose.cash.differenceCorrect')), 'empty counted cash is not treated as zero')
    for (const bad of ['1.000,00', '-5', '10.555']) {
      type(counted, bad); await pause(30)
      check(review().disabled && f.host.textContent?.includes(t('dailyOperation.invalidAmount')), `invalid counted cash refused: ${bad}`)
    }
    const bodies: unknown[] = []
    for (const typed of ['100,00', '100.00']) {
      type(counted, typed); type(inputByLabel(f.host, t('dayClose.cash.cashLeftLabel')), '50,5'); await pause(30)
      check(f.host.textContent?.includes(t('dayClose.cash.differenceCorrect')), `difference uses the normalized value (${typed})`)
      review().click(); await pause(60)
      button(t('dayClose.review.confirm')).click(); await pause(250)
      bodies.push(f.calls.filter(c => c.url.endsWith('/day-closes') && c.method === 'post').at(-1)?.body)
      const cancel = buttons().find(b => b.textContent?.trim() === t('common.cancel'))
      cancel?.click(); await pause(60)
    }
    const [comma, dot] = bodies as { counted_cash: string; cash_left_for_next_day: string; expected_cash_seen: string }[]
    check(comma?.counted_cash === '100.00' && dot?.counted_cash === '100.00' && typeof comma.counted_cash === 'string', `100,00 and 100.00 send the same decimal string (${JSON.stringify(bodies)})`)
    check(comma.cash_left_for_next_day === '50.50' && comma.expected_cash_seen === '100.00', 'other amounts normalized; expected cash untouched')
  } finally { await f.cleanup() }

  // Banner and current-operation metric (no request of their own).
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'app-day-close', component: { render: () => null } }] })
  await router.push('/')
  const host = document.createElement('main'); document.body.append(host)
  const base = { tables: { total: 4, free: 3, occupied: 1, occupancy_rate: 0.25 }, active_sessions: 1, active_guests: 2, orders: { active: 0, waiting_approval: 0, preparing: 0, ready: 0 }, staff: { active: 1 }, requests: { pending: 0 } }
  const card = { value: { state: 'open', business_date: '2026-10-21', received: '12.00' } as OperationsSummary['sales']['operation'] }
  const props = { manage: true }
  const metricHost = document.createElement('div')
  const app = createApp({ render: () => [
    h(DailyOperationBanner, { dailyOperation: { status: 'not_open' }, canManage: props.manage }),
  ] }).use(i18n).use(router)
  app.mount(host); await pause(200)
  const metrics = async (operation: OperationsSummary['sales']['operation']) => {
    card.value = operation
    const m = createApp({ render: () => h(QuickMetrics, { summary: { ...base, sales: { received_today: '99.00', operation: card.value } } as OperationsSummary, currency: 'EUR', pendingAttentionCount: 0 }) }).use(i18n)
    document.body.append(metricHost); m.mount(metricHost); await pause(900)
    const text = metricHost.textContent ?? ''
    m.unmount(); metricHost.remove()
    return text
  }
  try {
    check(host.querySelector('a')?.textContent?.trim() === t('dailyOperation.goToOpen') && host.textContent?.includes(t('dailyOperation.notOpenStaff')), 'closed banner guides and links managers')
    let text = await metrics({ state: 'open', business_date: '2026-10-21', received: '12.00' })
    check(text.includes(t('dailyOperation.salesMetric')) && text.includes('12.00') && !text.includes('99.00') && text.includes(t('dailyOperation.salesContextOpen', { date: '' }).split('·')[1].trim()), `open day: received of the operation, never the calendar day (${text})`)
    text = await metrics({ state: 'closed', business_date: '2026-10-21', closed_at: '2026-10-22T05:00:00Z', received: '25.50' })
    check(text.includes(t('dailyOperation.salesClosed')) && text.includes('25.50') && !text.includes('99.00'), 'after close: last closed day, clearly flagged')
    text = await metrics({ state: 'open', business_date: '2026-10-22', received: '0.00' })
    check(text.includes('0.00') && !text.includes('25.50'), 'new day starts at zero')
    text = await metrics({ state: 'none' })
    check(text.includes(t('dailyOperation.salesNone')) && text.includes('—') && !text.includes('0.00') && !text.includes('99.00'), 'never opened: explicit empty state, not zero')
    check(!text.includes(t('operations.salesToday')), 'card never says "sales"')
  } finally { app.unmount(); host.remove() }
  const host2 = document.createElement('main'); document.body.append(host2)
  const app2 = createApp({ render: () => h(DailyOperationBanner, { dailyOperation: { status: 'not_open' }, canManage: false }) }).use(i18n).use(router)
  app2.mount(host2); await pause(50)
  check(!host2.querySelector('a') && host2.textContent?.includes(t('dailyOperation.notOpen')), 'staff without permission get no financial/opening action')
  app2.unmount(); host2.remove()

  // Public QR: carta readable, nothing created, no automatic re-entry.
  let closed = true
  // First entry fails (network, no automatic retry); the explicit retry then
  // meets a closed day through the real public HTTP client.
  const q = await publicFixture({ locale: 'en-GB', failure: true })
  q.setFailure(false)
  const original = publicHttp.defaults.adapter
  publicHttp.defaults.adapter = async config => {
    if (config.url?.endsWith('/enter') && closed) {
      q.calls.push({ url: config.url, method: 'post', token: null, payload: null })
      throw new AxiosError('closed', 'ERR_BAD_REQUEST', config, undefined, { config, status: 409, statusText: '', headers: {}, data: { error: { code: 'RESTAURANT_DAY_NOT_OPEN', message: 'closed' } } })
    }
    return getAdapter(original)(config)
  }
  try {
    await q.state.reloadResolution(); await pause(150)
    const enters = () => q.calls.filter(c => c.url.endsWith('/enter')).length
    check(document.body.textContent?.includes(t('dailyOperation.public.closedTitle')), 'closed day shown to the customer')
    check(document.body.textContent?.includes('Arroz de prueba'), 'carta stays readable while closed')
    check(!q.calls.some(c => c.method === 'post' && !c.url.endsWith('/enter')), 'no order/request is sent while closed')
    const before = enters()
    await q.state.reloadResolution(); await q.state.refreshTracking(); await pause(100)
    check(enters() === before, 'background refresh never re-enters (no accidental session when the day opens)')
    closed = false
    button(t('dailyOperation.public.checkAgain')).click(); await pause(250)
    check(enters() === before + 1 && !document.body.textContent?.includes(t('dailyOperation.public.closedTitle')), 'explicit tap enters once the day is open')
  } finally { publicHttp.defaults.adapter = original; await q.cleanup() }
  return { checks }
}

let previewCleanup: (() => Promise<void>) | null = null
export async function preview(locale: AppLocale) {
  await previewCleanup?.(); i18n.global.locale.value = locale
  const f = await staffFixture(['open_daily_operation', 'close_daily_operation', 'manage_product_availability']); previewCleanup = f.cleanup
  await pause(200)
  return { overflow: document.documentElement.scrollWidth > innerWidth, smallTargets: [...f.host.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).length }
}
