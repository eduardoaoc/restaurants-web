/** Production views/components/services, controlled HTTP and private Echo transport. */
import { createApp, nextTick } from 'vue'
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
import ServiceView from '../src/views/service/ServiceView.vue'
import { fixture as publicFixture } from './frontend-qr-entry.browser'
import type { RestaurantProduct } from '../src/types/product'

const pause = async (ms = 70) => { await new Promise(r => setTimeout(r, ms)); await nextTick() }
function button(text: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)
  if (!b) throw Error(`Missing ${text}`)
  return b
}
const row = (id = 1, restaurant = 1, available = true): RestaurantProduct => ({ id, restaurant_id: restaurant, product_id: id, price: '12.50', available, created_at: '', updated_at: '', product: { id, organization_id: 1, internal_name: `Arroz ${id}`, status: 'active', sku: null, translations: [{ locale: 'es', name: `Arroz tradicional ${id}`, description: 'Arroz local' }], allergens: [], nutrition: null, media: { image: null, video: null }, created_at: '', updated_at: '' } })
async function staffFixture(allowed = true) {
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
  const contexts = [1, 2].map(id => ({ id, name: `Restaurante ${id}`, slug: `r${id}`, status: 'active', roles: [], permissions: allowed ? ['manage_product_availability'] : [], can_manage_table_structure: false }))
  auth.authContext = { user: { id: 5, name: 'Waiter', email: 'fixture@example.test', status: 'active' }, platform: { is_platform_admin: false, roles: [], permissions: [] }, organizations: [{ id: 1, name: 'Tenant', slug: 'tenant', status: 'active', roles: [], permissions: [], restaurants: contexts }] }
  restaurant.currentRestaurantId = 1
  let serverRows = [row(1), row(2)], fail = false, patchDelay = 80, readDelay = 0
  const calls: { url: string; method: string }[] = []
  http.defaults.adapter = async config => {
    const url = config.url ?? '', method = config.method ?? 'get'
    calls.push({ url, method })
    if (method === 'patch') {
      const id = Number(url.match(/restaurant-products\/(\d+)/)?.[1]), payload = JSON.parse(config.data)
      await pause(patchDelay)
      if (fail) throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, undefined, { config, status: 500, statusText: '', headers: {}, data: {} })
      serverRows = serverRows.map(p => p.id === id ? { ...p, available: payload.available } : p)
      return { config, status: 200, statusText: '', headers: {}, data: { data: { restaurant_product: serverRows.find(p => p.id === id) } } }
    }
    const id = Number(url.match(/restaurants\/(\d+)/)?.[1]), snapshot = structuredClone(serverRows.filter(p => p.restaurant_id === id))
    if (readDelay) await pause(readDelay)
    return { config, status: 200, statusText: '', headers: {}, data: { data: { restaurant_products: snapshot } } }
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  await router.push('/')
  const host = document.createElement('main'); host.className = 'p-4'; document.body.append(host)
  const app = createApp(ServiceView).use(pinia).use(i18n).use(router); app.mount(host); await pause(400)
  return { host, restaurant, auth, calls, setRows(rows: RestaurantProduct[]) { serverRows = rows }, fail(value: boolean) { fail = value }, delay(ms: number) { readDelay = ms },
    broadcast(id = 'event-1', restaurantId = 1) { callbacks.get(`restaurant.${restaurant.currentRestaurantId}`)?.get('.product.availability_changed')?.forEach(cb => cb({ event_id: id, restaurant_id: restaurantId, schema_version: 1, occurred_at: '', restaurant_product_id: 1 })) },
    async cleanup() { app.unmount(); host.remove(); disconnectEcho(); appConfig.reverb = oldReverb; http.defaults.adapter = oldHttp; await pause() } }
}

export async function runChecks() {
  let checks = 0
  const check = (value: unknown, message: string) => { if (!value) throw Error(message); checks++ }
  i18n.global.locale.value = 'en-GB'
  let f = await staffFixture(false)
  check(!f.host.textContent?.includes('Product availability') && f.calls.length === 0, 'permission gates CTA and reads')
  await f.cleanup(); f = await staffFixture()
  try {
    check(f.host.textContent?.includes('Arroz tradicional 1'), `operational product identity: ${f.host.textContent} calls=${JSON.stringify(f.calls)}`)
    const first = button('Mark sold out'); first.click(); first.click(); await pause(20)
    check(f.calls.filter(c => c.method === 'patch').length === 1, 'double click produces one mutation')
    check(first.disabled && ![...document.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent?.trim() === 'Mark sold out')[1]?.disabled, 'loading is per product')
    await pause(450)
    check(f.host.textContent?.includes('Sold out'), 'authoritative response marks sold out')
    f.fail(true); button('Make available').click(); await pause(450)
    check(f.host.textContent?.includes('Sold out') && !!f.host.querySelector('[role="alert"]'), 'failure retains state and inline error')
    f.fail(false); button('Make available').click(); await pause(450)
    check(!f.host.textContent?.includes('Sold out'), 'restore works without auto ordering')
    f.setRows([row(1, 1, false), row(2)]); const reads = f.calls.length
    f.broadcast('wrong', 2); await pause(350)
    check(f.calls.length === reads, 'foreign restaurant event ignored')
    f.broadcast(); f.broadcast(); await pause(400)
    check(f.calls.length === reads + 1 && f.host.textContent?.includes('Sold out'), 'duplicate event coalesces one authoritative read')
    f.delay(650); f.broadcast('slow'); await pause(300)
    f.restaurant.currentRestaurantId = 2; f.setRows([row(3, 2)]); await pause(50)
    f.restaurant.currentRestaurantId = 1; f.setRows([row(2)]); await pause(900)
    check(!f.host.textContent?.includes('Arroz tradicional 3'), 'A B A ignores stale responses')
    f.restaurant.currentRestaurantId = 2; await pause(30)
    check(!f.host.textContent?.includes('Arroz tradicional 1'), 'restaurant switch clears prior products immediately')
  } finally { await f.cleanup() }

  const p = await publicFixture({ locale: 'en-GB' })
  const original = publicHttp.defaults.adapter
  let sold = false, reject = false, posts = 0
  publicHttp.defaults.adapter = async config => {
    const result = await getAdapter(original)(config)
    if (config.url?.endsWith('/menu') && sold) result.data.data.menu!.categories = []
    if (config.url?.endsWith('/orders') && config.method === 'post') {
      posts++
      if (reject) throw new AxiosError('invalid', 'ERR_BAD_REQUEST', config, undefined, { config, status: 422, statusText: '', headers: {}, data: { error: { code: 'INVALID_ORDER_ITEM', message: 'invalid' } } })
    }
    return result
  }
  try {
    const product = { restaurant_product_id: 1, product_id: 1, name: 'Arroz de prueba', description: 'Arroz local', price: '10.00', allergens: [], nutrition: null, media: { image: null, video: null }, modifier_groups: [] }
    p.state.cart.addItem(product, 2, [], null)
    await pause()
    const cartButton = [...p.host.querySelectorAll<HTMLButtonElement>('button')].find(b => /^2/.test(b.textContent?.trim() ?? ''))
    if (!cartButton) throw Error('Missing cart entry')
    cartButton.click(); await pause()
    sold = true; await p.state.refreshTracking(); await pause()
    await p.state.confirmOrder()
    check(posts === 0 && p.state.cart.lines.value.length > 0, 'old cart stays intact and blocks send after poll')
    check(!p.host.textContent?.includes('Arroz de prueba'), 'sold out product hidden from public carta')
    check(document.body.textContent?.includes('Unavailable. You can remove this item.'), 'old cart identifies unavailable line')
    check(![...document.querySelectorAll<HTMLButtonElement>('button')].some(b => b.textContent?.trim() === i18n.global.t('publicMenu.cart.confirm') && !b.disabled), 'old cart confirm is blocked')
    sold = false; await p.state.refreshTracking(); await pause()
    check(p.host.textContent?.includes('Arroz de prueba'), 'restore appears on same public tracking mechanism')
    reject = true; await p.state.confirmOrder(); await pause()
    check(posts === 1 && p.state.cart.lines.value.length > 0, 'authoritative rejection preserves cart')
    check(document.body.textContent?.includes('A product is no longer available'), 'domain error translated')
    p.state.cart.addItem({ ...product, restaurant_product_id: 2, name: 'Keep this selection' }, 1, [], null)
    await pause()
    const remove = document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.global.t('publicMenu.cart.remove')}"]`)
    if (!remove) throw Error('Missing remove action')
    remove.click(); await pause()
    check(p.state.cart.lines.value.length === 1 && document.body.textContent?.includes('Keep this selection'), 'removing unavailable item preserves the rest of the cart')
  } finally { publicHttp.defaults.adapter = original; await p.cleanup() }
  return { checks }
}
let previewCleanup: (() => Promise<void>) | null = null
export async function preview(locale: AppLocale) {
  await previewCleanup?.(); i18n.global.locale.value = locale
  const f = await staffFixture(); previewCleanup = f.cleanup
  f.setRows([row(1, 1, false), row(2)]); f.broadcast('preview'); await pause(400)
  return { overflow: document.documentElement.scrollWidth > innerWidth, smallTargets: [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).length }
}
