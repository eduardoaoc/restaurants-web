import assert from 'node:assert/strict'
import { createServer } from 'vite'
import axios, { AxiosError } from 'axios'
import { createPinia, setActivePinia } from 'pinia'

process.env.VITE_PUBLIC_APP_URL = 'https://app.staging.example'

// Vite loads the real frontend modules; all HTTP calls use local doubles.
const server = await createServer({
  mode: 'development',
  server: { middlewareMode: true }, appType: 'custom',
  plugins: [{ name: 'test-memory-router', enforce: 'pre', transform(code, id) {
    // Route components are placeholders; these checks exercise actual guards, not DOM rendering.
    if (/\/src\/(views|layouts)\/.*\.vue$/.test(id.replaceAll('\\', '/'))) return '<template><div /></template>'
    if (id.replaceAll('\\', '/').endsWith('/src/router/index.ts')) return code.replaceAll('createWebHistory', 'createMemoryHistory')
  } }],
})
let passed = 0
const check = (fn) => { fn(); passed++ }
try {
  const { validateEnv } = await server.ssrLoadModule('/src/config/env.ts')
  const local = { VITE_API_URL: 'http://localhost:8080', VITE_PUBLIC_APP_URL: '' }
  check(() => assert.equal(validateEnv(local, 'development').target, 'local'))
  check(() => assert.equal(validateEnv(local, 'development').publicAppUrl, ''))
  check(() => assert.throws(() => validateEnv(local, 'qa'), /Invalid build configuration: MODE/))
  const safe = { VITE_API_URL: 'https://api.staging.example', VITE_PUBLIC_APP_URL: 'https://app.staging.example' }
  check(() => assert.equal(validateEnv({ VITE_API_URL: 'http://localhost:8080', VITE_PUBLIC_APP_URL: 'http://localhost:5174' }, 'development').publicAppUrl, 'http://localhost:5174'))
  for (const mode of ['staging', 'production']) {
    check(() => assert.equal(validateEnv(safe, mode).publicAppUrl, safe.VITE_PUBLIC_APP_URL))
    for (const key of ['VITE_API_URL', 'VITE_PUBLIC_APP_URL']) {
      for (const value of ['', 'http://app.example', 'https://localhost', 'https://127.0.0.1', 'https://0.0.0.0', 'https://[::1]', 'https://127.1', 'https://localtest.localhost', 'invalid', 'https://app.example/path', 'https://u:p@app.example', 'https://app.example?x=1']) {
        check(() => assert.throws(() => validateEnv({ ...safe, [key]: value }, mode), new RegExp(key)))
      }
    }
    const realtime = { ...safe, VITE_REVERB_APP_KEY: 'public-key', VITE_REVERB_HOST: 'ws.staging.example', VITE_REVERB_PORT: '443', VITE_REVERB_SCHEME: 'https' }
    check(() => assert.equal(validateEnv(realtime, mode).realtimeConfigured, true))
    check(() => assert.equal(validateEnv({ ...realtime, VITE_REVERB_SCHEME: ' https ' }, mode).reverb.tls, true))
    for (const [key, value] of [['VITE_REVERB_HOST', 'localhost'], ['VITE_REVERB_HOST', 'https://ws.example'], ['VITE_REVERB_PORT', '0'], ['VITE_REVERB_PORT', 'abc'], ['VITE_REVERB_SCHEME', 'http'], ['VITE_REVERB_APP_KEY', '']]) check(() => assert.throws(() => validateEnv({ ...realtime, [key]: value }, mode), new RegExp(key)))
  }
  const { installSessionInterceptor } = await server.ssrLoadModule('/src/api/session.ts')
  const { normalizeApiError } = await server.ssrLoadModule('/src/api/errors.ts')
  const { parseRetryAfter } = await server.ssrLoadModule('/src/api/retry-after.ts')
  const failure = (status, config = {}) => new AxiosError('fixture', 'ERR_BAD_RESPONSE', config, undefined, status ? { status, data: {}, headers: {}, config } : undefined)
  const client = axios.create()
  let expired = 0
  installSessionInterceptor(client, () => expired++)
  for (const status of [401, 419, 500, undefined]) {
    client.defaults.adapter = async config => { throw failure(status, config) }
    await assert.rejects(client.get('/api/v1/products'))
  }
  check(() => assert.equal(expired, 2))
  for (const url of ['/api/v1/auth/login', '/sanctum/csrf-cookie', '/api/v1/auth/logout']) {
    for (const status of [401, 419]) {
      client.defaults.adapter = async config => { throw failure(status, config) }
      await assert.rejects(client.post(url))
    }
  }
  check(() => assert.equal(expired, 2))
  check(() => assert.equal(normalizeApiError(failure(419)).kind, 'unauthenticated'))
  check(() => assert.equal(normalizeApiError(failure(500)).kind, 'server'))
  check(() => assert.equal(normalizeApiError(failure()).kind, 'network'))
  check(() => assert.equal(parseRetryAfter('120'), 120))
  check(() => assert.equal(parseRetryAfter('Sun, 04 Oct 2026 12:01:00 GMT', Date.parse('2026-10-04T12:00:00Z')), 60))
  check(() => assert.equal(parseRetryAfter('-1'), undefined))
  const { http } = await server.ssrLoadModule('/src/api/http.ts')
  const { publicHttp } = await server.ssrLoadModule('/src/api/public-http.ts')
  check(() => assert.equal(http.defaults.timeout, 30000))
  check(() => assert.equal(publicHttp.defaults.timeout, 30000))
  check(() => assert.notEqual(publicHttp.defaults.withCredentials, true))
  const { authService } = await server.ssrLoadModule('/src/services/auth.service.ts')
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts')
  const { useRestaurantStore } = await server.ssrLoadModule('/src/stores/restaurant.ts')
  globalThis.localStorage = { getItem: () => null, removeItem() {}, setItem() {} }
  authService.context = async () => ({ organizations: [], platform: null })
  for (const status of [401, 419, 500, undefined]) {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    authService.me = async () => { throw failure(status) }
    await auth.bootstrap()
    check(() => assert.equal(auth.unavailable, status !== 401 && status !== 419))
    check(() => assert.equal(auth.initializing, false))
    if (auth.unavailable) {
      authService.me = async () => ({ id: 1, name: 'Fixture' })
      await auth.retryBootstrap()
      check(() => assert.equal(auth.authenticated, true))
      check(() => assert.equal(auth.unavailable, false))
    }
  }
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, name: 'Fixture' }
  useRestaurantStore().currentRestaurantId = 3
  auth.expireSession()
  check(() => assert.equal(auth.user, null))
  check(() => assert.equal(auth.notice, 'sessionExpired'))
  check(() => assert.equal(useRestaurantStore().currentRestaurantId, null))
  auth.expireSession()
  check(() => assert.equal(auth.notice, 'sessionExpired'))
  for (const offline of [false, true]) {
    auth.user = { id: 1, name: 'Fixture' }
    authService.logout = async () => { if (offline) throw failure() }
    await auth.logout()
    check(() => assert.equal(auth.authenticated, false))
    check(() => assert.equal(auth.notice, offline ? 'logoutIncomplete' : null))
  }
  const { default: router } = await server.ssrLoadModule('/src/router/index.ts')
  for (const status of [401, 419, 500, undefined]) {
    setActivePinia(createPinia())
    authService.me = async () => { throw failure(status) }
    await router.replace({ path: '/app/dashboard', force: true })
    check(() => assert.equal(router.currentRoute.value.name, status === 401 || status === 419 ? 'login' : 'app-dashboard'))
    check(() => assert.equal(useAuthStore().unavailable, status !== 401 && status !== 419))
  }
  authService.me = async () => { throw new Error('Public route must not bootstrap auth') }
  setActivePinia(createPinia())
  await router.replace('/t/fixture')
  check(() => assert.equal(router.currentRoute.value.name, 'public-table'))
  check(() => assert.equal(useAuthStore().initializing, true))
  setActivePinia(createPinia())
  authService.me = async () => ({ id: 1, name: 'Fixture' })
  const logoutAuth = useAuthStore()
  await logoutAuth.bootstrap()
  authService.logout = async () => { throw failure() }
  await logoutAuth.logout()
  await router.push({ name: 'login' })
  check(() => assert.equal(router.currentRoute.value.name, 'login'))
  check(() => assert.equal(logoutAuth.notice, 'logoutIncomplete'))
  const { buildTablePublicUrl } = await server.ssrLoadModule('/src/utils/table-public-url.ts')
  const url = buildTablePublicUrl('fixture/token')
  check(() => assert.equal(url, 'https://app.staging.example/t/fixture%2Ftoken'))
  check(() => assert.equal(buildTablePublicUrl(''), null))
  console.log(`PASS: ${passed} focused hardening checks`)
} finally {
  await server.close()
}
