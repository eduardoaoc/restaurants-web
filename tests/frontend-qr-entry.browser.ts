/** Mounted public view + production composables/services; HTTP is simulated. */
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { AxiosError } from 'axios'
import { publicHttp } from '../src/api/public-http'
import { http } from '../src/api/http'
import { i18n, type AppLocale } from '../src/i18n'
import PublicTableView from '../src/views/public/PublicTableView.vue'
import type { PublicProduct } from '../src/types/public-menu'
import { readPublicVisitToken } from '../src/utils/public-visit-context'

const pause = async (ms = 40) => { await new Promise(resolve => setTimeout(resolve, ms)); await nextTick() }
const product: PublicProduct = { restaurant_product_id: 1, product_id: 1, name: 'Arroz de prueba', description: 'Arroz local', price: '10.00', allergens: [], nutrition: null, media: { image: null, video: null }, modifier_groups: [] }
let sequence = 0
export async function fixture(options: { delayed?: boolean; failure?: boolean; paid?: boolean; paidNewcomer?: boolean; active?: boolean; gate?: boolean; locale?: AppLocale } = {}) {
  const qr = `fixture-qr-entry-${++sequence}`
  const visitToken = `fixture-visit-${sequence}`
  if (options.paid) sessionStorage.setItem(`aforo-public-visit:${qr}`, visitToken)
  if (!options.gate) sessionStorage.setItem(`aforo-public-menu-entered:${qr}`, '1')
  const originalPublic = publicHttp.defaults.adapter, originalStaff = http.defaults.adapter
  let failure = options.failure ?? false, paid = options.paid ?? false, active = options.active ?? true
  let releaseEntry: (() => void) | undefined
  const barrier = options.delayed ? new Promise<void>(resolve => { releaseEntry = resolve }) : Promise.resolve()
  const calls: { url: string; method: string; token: unknown; payload: unknown }[] = []
  const resolution = () => ({
    restaurant: { id: 1, name: 'Restaurante de prueba', default_locale: options.locale ?? 'es-ES', enabled_locales: ['es-ES', 'ca-ES-valencia', 'en-GB'], capabilities: { customer_ordering: true, waiter_call: true, bill_request: true } },
    table: { id: 1, name: 'Mesa 1', number: 1 },
    session: { active, status: active ? 'occupied' : 'closed', feedback: { eligible: paid, token: visitToken, already_submitted: false }, bill_request: { eligible: false, reason: paid ? 'already_paid' : 'no_billable_orders' } },
    menu: { available: true },
  })
  http.defaults.adapter = async config => { throw new AxiosError('Unauthenticated', 'ERR_BAD_RESPONSE', config, undefined, { status: 401, statusText: '', headers: {}, config, data: {} }) }
  publicHttp.defaults.adapter = async config => {
    const url = config.url ?? '', method = config.method ?? 'get'
    calls.push({ url, method, token: config.headers.get('X-Table-Visit'), payload: config.data })
    const respond = (data: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data: { data } })
    if (url.endsWith('/enter')) {
      await barrier
      if (options.paidNewcomer) throw new AxiosError('Paid fixture', 'ERR_BAD_RESPONSE', config, undefined, { config, status: 409, statusText: '', headers: {}, data: { error: { code: 'TABLE_SESSION_ALREADY_PAID', message: 'Already paid.' } } })
      if (failure) throw new AxiosError('Network fixture', 'ERR_NETWORK', config)
      return respond(resolution())
    }
    if (url.includes('/public/visits/')) return respond({ restaurant: { name: 'Restaurante de prueba' }, table: { name: 'Mesa 1' }, visit: { active, paid_at: new Date().toISOString(), closed_at: active ? null : new Date().toISOString() }, orders: [], summary: { total: '0.00' }, google_review: { available: false, url: null } })
    if (url.endsWith('/menu')) return respond({ ...resolution(), locale: 'es', menu: { id: 1, categories: [{ id: 1, slug: 'arroces', name: 'Arroces', description: null, products: [product] }] } })
    if (url.endsWith('/orders') && method === 'get') return { ...respond({ orders: [] }), data: { data: { orders: [] }, meta: { next_before_id: null } } }
    if (url.endsWith('/orders')) {
      await pause(80)
      return respond({ id: 1, order_number: '#1', status: 'waiting_approval', total: '10.00', items: [], created_at: new Date().toISOString() })
    }
    return respond(resolution())
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/t/:publicToken', component: PublicTableView }] })
  await router.push(`/t/${qr}`)
  const host = document.createElement('main'); document.body.append(host)
  const app = createApp(PublicTableView).use(createPinia()).use(i18n).use(router)
  app.mount(host)
  const state = (app._instance as unknown as { setupState: {
    cart: { addItem: (p: PublicProduct, qty: number, modifiers: [], note: null) => void; lines: { value: unknown[] } }
    refreshTracking: () => Promise<void>; publicHistory: { refresh: () => Promise<void> }; confirmOrder: () => Promise<void>; reloadResolution: () => Promise<void>; startNewVisit: () => Promise<void>
  } }).setupState
  await pause()
  return { qr, visitToken, calls, state, host, release: () => releaseEntry?.(), setFailure: (v: boolean) => { failure = v }, setSession: (isActive: boolean, isPaid: boolean) => { active = isActive; paid = isPaid },
    cleanup: async () => { app.unmount(); host.remove(); publicHttp.defaults.adapter = originalPublic; http.defaults.adapter = originalStaff; await nextTick() } }
}

export async function runChecks() {
  let checks = 0
  const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); checks++ }
  let f = await fixture({ delayed: true })
  try {
    check(f.calls.filter(c => c.url.endsWith('/enter')).length === 1, 'QR starts exactly one entry POST')
    check(!f.calls.some(c => c.url.endsWith('/menu')), 'menu waits for authoritative visit')
    f.state.cart.addItem(product, 1, [], null)
    await f.state.confirmOrder()
    check(!f.calls.some(c => c.url.endsWith('/orders') && c.method === 'post'), 'checkout blocked before session exists')
    check(f.host.textContent?.includes(i18n.global.t('publicMenu.loading')), 'loading feedback while entry pending')
    f.release(); await pause(100)
    check(readPublicVisitToken(f.qr) === f.visitToken, 'entry persists tab visit context')
    check(f.calls.find(c => c.url.endsWith('/menu'))?.token === f.visitToken, 'menu uses the returned visit binding')
    check(f.state.cart.lines.value.length === 0, 'fresh visit clears old local cart')
    f.state.cart.addItem(product, 1, [], null)
    const first = f.state.confirmOrder(), second = f.state.confirmOrder()
    await Promise.all([first, second]); await pause()
    const orders = f.calls.filter(c => c.url.endsWith('/orders') && c.method === 'post')
    check(orders.length === 1, 'double checkout sends one order')
    check(orders[0]?.token === f.visitToken, 'order uses exact visit credential')
    check(document.body.textContent?.includes(i18n.global.t('publicMenu.confirmation.waitingApproval')), 'authoritative waiting approval is presented')
    await f.state.reloadResolution()
    check(f.calls.filter(c => c.url.endsWith('/enter')).length === 1, 'poll/reload is GET and cannot open a visit')
    check(f.calls.filter(c => c.method === 'get').every(c => c.token === f.visitToken), 'all table reads remain pinned')
    await f.cleanup()

    f = await fixture({ failure: true })
    check(!!f.host.querySelector('button') && f.host.textContent?.includes(i18n.global.t('publicMenu.errors.retry')), 'entry failure provides manual retry')
    await pause(150)
    check(f.calls.length === 1, 'failure does not retry automatically')
    f.setFailure(false)
    await Promise.all([f.state.reloadResolution(), f.state.reloadResolution()]); await pause()
    check(f.calls.filter(c => c.url.endsWith('/enter')).length === 2, 'manual retries are coalesced')
    check(f.host.textContent?.includes('Arroz de prueba'), 'successful retry loads the existing menu')
    await f.cleanup()

    f = await fixture()
    f.setSession(false, true)
    // Another tab's local feedback context must never replace this visit.
    localStorage.setItem(`aforo-feedback:${f.qr}`, JSON.stringify({ token: 'different-fixture-visit', submitted: false }))
    await f.state.reloadResolution(); await pause(100)
    check(f.calls.some(c => c.url.endsWith(`/visits/${f.visitToken}`)), 'closed paid visit resolves its own post-visit context')
    check(!f.calls.some(c => c.url.endsWith('/visits/different-fixture-visit')), 'shared localStorage cannot retarget old visit')
    f.state.cart.addItem(product, 1, [], null); await f.state.confirmOrder()
    check(!f.calls.some(c => c.url.endsWith('/orders') && c.method === 'post'), 'closed/paid visit blocks ordering')
    check(f.calls.filter(c => c.url.endsWith('/enter')).length === 1, 'closed visit never triggers new entry')
    check(document.body.textContent?.includes(i18n.global.t('publicMenu.entry.newVisit')), 'closed visit offers explicit fresh entry')
    f.setSession(true, false)
    await f.state.startNewVisit(); await pause()
    const entries = f.calls.filter(c => c.url.endsWith('/enter'))
    check(entries.length === 2 && entries[1]?.token == null, 'only explicit new visit detaches previous token')
    check(f.state.cart.lines.value.length === 0, 'explicit new visit resets previous cart')
    await f.cleanup()

    f = await fixture({ paidNewcomer: true })
    check(f.host.textContent?.includes(i18n.global.t('publicMenu.errors.alreadyPaid')), 'fresh arrival at paid table receives availability error')
    check(!f.calls.some(c => c.url.includes('/public/visits/')), 'fresh paid-table arrival cannot read previous bill')
    check(readPublicVisitToken(f.qr) === null, 'fresh paid-table arrival receives no visit credential')
    await f.cleanup()

    for (const locale of ['es-ES', 'ca-ES-valencia', 'en-GB'] as const) {
      f = await fixture({ paid: true, locale })
      await pause(80)
      check(f.calls.find(c => c.url.endsWith('/enter'))?.token === f.visitToken, `paid entry is an existing pinned visit in ${locale}`)
      check(f.calls.some(c => c.url.endsWith(`/visits/${f.visitToken}`)), `paid entry keeps post-visit in ${locale}`)
      check(!f.host.textContent?.includes('publicMenu.'), `no missing translations in ${locale}`)
      await f.cleanup()
    }
    // Per-QR storage must never leak a credential to another table.
    f = await fixture({ gate: true })
    check(f.calls.find(c => c.url.endsWith('/enter'))?.token == null, 'different QR starts without another table token')
    await pause(5000)
    check(f.host.textContent?.includes(i18n.global.t('publicMenu.entry.viewMenu')), 'welcome gate and existing actions remain available')
    return { checks }
  } finally { await f.cleanup() }
}

export async function showFailure(locale: AppLocale = 'es-ES') {
  return fixture({ failure: true, locale })
}
