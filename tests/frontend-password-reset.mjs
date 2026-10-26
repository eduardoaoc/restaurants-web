// Password recovery — focused checks with local doubles (same harness style
// as frontend-invitations.mjs). Not an integration test.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import axios, { AxiosError } from 'axios'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom',
  plugins: [{ name: 'reset-memory-router', enforce: 'pre', transform(code, id) {
    if (/\/src\/(views|layouts)\/.*\.vue$/.test(id.replaceAll('\\', '/'))) return '<template><div /></template>'
    if (id.replaceAll('\\', '/').endsWith('/src/router/index.ts')) return code.replaceAll('createWebHistory', 'createMemoryHistory')
  } }],
})
let checks = 0
const check = fn => { fn(); ++checks }
globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null }, setItem(k, v) { this.store[k] = String(v) }, removeItem(k) { delete this.store[k] } }

// Minimal browser location/history double for url-secret.ts.
const replaced = []
function browserAt(pathname, hash) {
  globalThis.window = {
    location: { pathname, hash },
    history: { state: null, replaceState(_s, _t, url) { replaced.push(url); globalThis.window.location.hash = ''; globalThis.window.location.pathname = url } },
  }
}

try {
  // 1. Secret capture: stripped from the URL before anything else, handed out once, per path.
  browserAt('/reset-password', '#token=abc123&email=ana%40example.com')
  const secrets = await server.ssrLoadModule('/src/utils/url-secret.ts') // module evaluation captures
  check(() => assert.deepEqual(replaced, ['/reset-password']))
  check(() => assert.equal(window.location.hash, ''))
  check(() => assert.equal(secrets.takeUrlSecret('/invitation'), null, 'other path gets nothing'))
  const params = secrets.takeUrlSecret('/reset-password')
  check(() => assert.equal(params.get('token'), 'abc123'))
  check(() => assert.equal(params.get('email'), 'ana@example.com'))
  check(() => assert.equal(secrets.takeUrlSecret('/reset-password'), null, 'handed out only once'))
  browserAt('/invitation', '#token=inv-xyz') // link opened in an already-running tab
  check(() => assert.equal(secrets.takeUrlSecret('/invitation').get('token'), 'inv-xyz'))
  check(() => assert.equal(window.location.hash, ''))
  browserAt('/app/dashboard', '#token=should-stay')
  secrets.captureUrlSecrets()
  check(() => assert.equal(window.location.hash, '#token=should-stay', 'only the two secret routes are touched'))
  check(() => assert.ok(!JSON.stringify(localStorage.store).includes('abc123'), 'never persisted'))

  // 2. Session guard lets the recovery endpoints through after a session ended.
  const { installSessionInterceptor } = await server.ssrLoadModule('/src/api/session.ts')
  const client = axios.create()
  installSessionInterceptor(client, () => {}, () => ({ version: 2, authenticated: false }))
  client.defaults.adapter = async config => ({ status: 200, data: {}, config, headers: {} })
  for (const path of ['/api/v1/auth/forgot-password', '/api/v1/auth/reset-password/preview', '/api/v1/auth/reset-password']) {
    await client.post(path, {}); checks++
  }

  // 3. Service contract: token/password only in JSON bodies.
  const { http } = await server.ssrLoadModule('/src/api/http.ts')
  const sent = []
  let respond = () => ({ status: 200, data: {} })
  http.defaults.adapter = async config => {
    sent.push(config)
    const { status, data } = respond(config)
    if (status >= 400) throw new AxiosError('fixture', '', config, null, { status, data, headers: {}, config })
    return { status, data, headers: {}, config }
  }
  const { authService } = await server.ssrLoadModule('/src/services/auth.service.ts')
  await authService.forgotPassword('ana@example.com', 'ca-ES-valencia')
  await authService.previewPasswordReset('ana@example.com', 'tok-1')
  await authService.resetPassword('ana@example.com', 'tok-1', 'new-pass-1', 'new-pass-1')
  const [forgot, preview, reset] = sent.splice(0)
  check(() => assert.deepEqual(JSON.parse(forgot.data), { email: 'ana@example.com', locale: 'ca-ES-valencia' }))
  check(() => assert.deepEqual(JSON.parse(preview.data), { email: 'ana@example.com', token: 'tok-1' }))
  check(() => assert.deepEqual(JSON.parse(reset.data), { email: 'ana@example.com', token: 'tok-1', password: 'new-pass-1', password_confirmation: 'new-pass-1' }))
  for (const config of [forgot, preview, reset]) {
    check(() => assert.equal(config.method, 'post'))
    check(() => assert.ok(!String(config.url).includes('tok-1') && !JSON.stringify(config.params ?? {}).includes('tok-1')))
  }

  // 4. Error mapping.
  const { normalizeApiError } = await server.ssrLoadModule('/src/api/errors.ts')
  const { describeApiError } = await server.ssrLoadModule('/src/utils/error-message.ts')
  const invalid = normalizeApiError(new AxiosError('x', '', {}, null, { status: 422, data: { error: { code: 'PASSWORD_RESET_INVALID', message: 'raw' } }, headers: {}, config: {} }))
  check(() => assert.equal(describeApiError(invalid, k => k), 'passwordReset.invalid'))

  // 5. Router: recovery pages reachable by guests and signed-in users; app stays protected.
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts')
  const { restaurantsService } = await server.ssrLoadModule('/src/services/restaurants.service.ts')
  const { default: router } = await server.ssrLoadModule('/src/router/index.ts')
  setActivePinia(createPinia())
  authService.me = async () => { throw new AxiosError('x', '', {}, null, { status: 401, data: {}, headers: {}, config: {} }) }
  for (const name of ['forgot-password', 'reset-password']) {
    await router.replace({ name, force: true })
    check(() => assert.equal(router.currentRoute.value.name, name))
  }
  await router.replace({ path: '/app/dashboard', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'login'))

  setActivePinia(createPinia())
  authService.me = async () => ({ id: 1, name: 'Ana', email: 'ana@example.com' })
  authService.context = async () => ({ active_organization_id: 1, organizations: [{ id: 1, status: 'active', permissions: [], restaurants: [{ id: 1, status: 'active', permissions: ['view_operations'] }] }], platform: { is_platform_admin: false, roles: [], permissions: [] } })
  restaurantsService.list = async () => [{ id: 1 }]
  restaurantsService.settings = async () => ({})
  useAuthStore()
  await router.replace({ name: 'reset-password', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'reset-password'))

  console.log(`PASS: ${checks} password-recovery checks (local doubles; views are placeholders)`)
} finally {
  await server.close()
}
