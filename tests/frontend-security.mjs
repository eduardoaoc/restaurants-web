import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import axios, { AxiosError } from 'axios'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom',
  plugins: [{ name: 'security-memory-router', enforce: 'pre', transform(code, id) {
    if (/\/src\/(views|layouts)\/.*\.vue$/.test(id.replaceAll('\\', '/'))) return '<template><div /></template>'
    if (id.replaceAll('\\', '/').endsWith('/src/router/index.ts')) return code.replaceAll('createWebHistory', 'createMemoryHistory')
  } }],
})
let checks = 0
const check = fn => { fn(); ++checks }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
try {
  const { safeHttpUrl } = await server.ssrLoadModule('/src/utils/safe-url.ts')
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//evil.example', 'https://', 'https://u:p@evil.example', 'https:\\evil.example', 'java\nscript:alert(1)', ' https://example.com', 'https://example.com/\nsecret']) check(() => assert.equal(safeHttpUrl(url), undefined))
  for (const url of ['https://g.page/r/example/review', 'http://localhost:8080/storage/photo.webp', 'https://cdn.example/photo.webp']) check(() => assert.equal(safeHttpUrl(url), url))
  const { normalizeApiError } = await server.ssrLoadModule('/src/api/errors.ts')
  const error = (status, data) => new AxiosError('fixture', '', {}, null, { status, data, headers: {}, config: {} })
  for (const diagnostic of ['SQLSTATE[42]: SELECT password FROM users', 'Stack trace at /var/www/app.php:20', 'Bearer eyJfixture.secret.value', 'token=private-fixture', 'C:\\Users\\fixture\\source.php']) {
    const result = normalizeApiError(error(422, { message: diagnostic, errors: { name: [diagnostic] } }))
    check(() => assert.equal(result.message, undefined))
    check(() => assert.deepEqual(result.fieldErrors.name, []))
  }
  check(() => assert.equal(normalizeApiError(error(409, { error: { code: 'CONFLICT', message: 'This table is already closed.' } })).message, 'This table is already closed.'))
  const { installSessionInterceptor } = await server.ssrLoadModule('/src/api/session.ts')
  const client = axios.create()
  let state = { version: 0, authenticated: true }
  installSessionInterceptor(client, () => { state = { version: state.version + 1, authenticated: false } }, () => state)
  const late = deferred()
  let calls = 0
  client.defaults.adapter = async config => { calls++; await late.promise; return { status: 200, data: 'old tenant', config, headers: {} } }
  const request = client.get('/api/v1/orders')
  await new Promise(r => setTimeout(r, 0))
  state = { version: 1, authenticated: false }
  late.resolve()
  await assert.rejects(request, /Stale session response/); checks++
  await assert.rejects(client.post('/api/v1/orders'), /Session ended/); checks++
  check(() => assert.equal(calls, 1))
  const { authService } = await server.ssrLoadModule('/src/services/auth.service.ts')
  const { restaurantsService } = await server.ssrLoadModule('/src/services/restaurants.service.ts')
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts')
  const { useRestaurantStore } = await server.ssrLoadModule('/src/stores/restaurant.ts')
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, name: 'Fixture' }
  const context = deferred()
  authService.context = () => context.promise
  const refresh = auth.refreshAuthContext()
  auth.expireSession()
  context.resolve({ organizations: [{ permissions: ['manage_users'] }] })
  await refresh
  check(() => assert.equal(auth.authContext, null))
  const oldContext = deferred(), newContext = deferred()
  let contextCalls = 0
  authService.context = () => (++contextCalls === 1 ? oldContext.promise : newContext.promise)
  const firstContext = auth.refreshAuthContext(), secondContext = auth.refreshAuthContext()
  newContext.resolve({ organizations: [], marker: 'new permissions' }); await secondContext
  oldContext.resolve({ organizations: [], marker: 'revoked permissions' }); await firstContext
  check(() => assert.equal(auth.authContext.marker, 'new permissions'))
  const me = deferred()
  authService.me = () => me.promise
  const bootstrap = auth.fetchUser()
  authService.logout = async () => {}
  await auth.logout()
  me.resolve({ id: 1, name: 'Late identity' })
  await bootstrap
  check(() => assert.equal(auth.authenticated, false))
  const store = useRestaurantStore()
  const list = deferred()
  restaurantsService.list = () => list.promise
  const loading = store.load()
  store.clearRestaurant()
  list.resolve([{ id: 1, name: 'Old restaurant' }])
  await loading
  check(() => assert.deepEqual(store.restaurants, []))
  store.restaurants = [{ id: 1 }, { id: 2 }]
  auth.authContext = { organizations: [{ status: 'active', restaurants: [1, 2].map(id => ({ id, status: 'active', permissions: ['manage_restaurants'] })) }] }
  const firstA = deferred(), b = deferred(), secondA = deferred()
  let aCalls = 0
  restaurantsService.settings = id => id === 2 ? b.promise : (++aCalls === 1 ? firstA.promise : secondA.promise)
  const a1 = store.selectRestaurant(1), b1 = store.selectRestaurant(2), a2 = store.selectRestaurant(1)
  secondA.resolve({ marker: 'new A' }); await a2
  firstA.resolve({ marker: 'old A' }); await a1
  b.resolve({ marker: 'B' }); await b1
  check(() => assert.equal(store.currentSettings.marker, 'new A'))
  const { useDayCloseSubmit } = await server.ssrLoadModule('/src/composables/useDayCloseSubmit.ts')
  const { dayCloseService } = await server.ssrLoadModule('/src/services/day-close.service.ts')
  const close = deferred(); let submissions = 0
  dayCloseService.create = async () => { submissions++; return close.promise }
  let submit
  await renderToString(createSSRApp({ setup() { submit = useDayCloseSubmit(() => 1); return () => null } }))
  const one = submit.submit({}), two = submit.submit({})
  close.resolve({ id: 3 }); await Promise.all([one, two])
  check(() => assert.equal(submissions, 1))
  const { default: router } = await server.ssrLoadModule('/src/router/index.ts')
  for (const permissions of [['create_orders', 'serve_orders', 'close_daily_operation'], ['record_payments', 'close_bill', 'close_daily_operation'], ['update_kitchen_status']]) {
    setActivePinia(createPinia())
    authService.me = async () => ({ id: 1, name: 'Fixture' })
    authService.context = async () => ({ organizations: [{ status: 'active', permissions: [], restaurants: [{ id: 1, status: 'active', permissions }] }], platform: { permissions: [] } })
    restaurantsService.list = async () => [{ id: 1 }]
    for (const path of ['/app/settings', '/app/staff', '/app/menu', '/app/feedback', '/app/day-close/1']) {
      await router.replace({ path, force: true })
      check(() => assert.notEqual(router.currentRoute.value.path, path))
    }
    await router.replace({ path: '/app/day-close', force: true })
    check(() => assert.equal(router.currentRoute.value.name === 'app-day-close', permissions.includes('close_daily_operation')))
    await router.replace('/login?next=https://evil.example&redirect=//evil.example')
    check(() => assert.ok(router.currentRoute.value.path.startsWith('/app/')))
  }
  console.log(`PASS: ${checks} adversarial security checks (local doubles; guard components are placeholders)`)
} finally { await server.close() }
