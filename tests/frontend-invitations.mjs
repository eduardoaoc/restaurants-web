// Onboarding / invitations block — focused checks with local doubles (same
// harness style as frontend-security.mjs): real services, stores, router,
// composables and error mapping; HTTP replaced by an axios adapter double,
// views/layouts replaced by placeholders. Not an integration test.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError } from 'axios'
import { effectScope } from 'vue'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom',
  plugins: [{ name: 'invitations-memory-router', enforce: 'pre', transform(code, id) {
    if (/\/src\/(views|layouts)\/.*\.vue$/.test(id.replaceAll('\\', '/'))) return '<template><div /></template>'
    if (id.replaceAll('\\', '/').endsWith('/src/router/index.ts')) return code.replaceAll('createWebHistory', 'createMemoryHistory')
  } }],
})
let checks = 0
const check = fn => { fn(); ++checks }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null }, setItem(k, v) { this.store[k] = String(v) }, removeItem(k) { delete this.store[k] } }

try {
  const { http } = await server.ssrLoadModule('/src/api/http.ts')
  const sent = []
  let respond = () => ({ status: 200, data: { data: {} } })
  http.defaults.adapter = async config => {
    sent.push(config)
    const { status, data } = respond(config)
    if (status >= 400) throw new AxiosError('fixture', '', config, null, { status, data, headers: {}, config })
    return { status, data, headers: {}, config }
  }

  // 1. Session guard: invitation endpoints work after a session ended; others stay blocked.
  const { installSessionInterceptor } = await server.ssrLoadModule('/src/api/session.ts')
  const axios = (await import('axios')).default
  const client = axios.create()
  installSessionInterceptor(client, () => {}, () => ({ version: 1, authenticated: false }))
  client.defaults.adapter = async config => ({ status: 200, data: {}, config, headers: {} })
  for (const path of ['/api/v1/invitations/preview', '/api/v1/invitations/accept', '/api/v1/invitations/accept-existing']) {
    await client.post(path, {}); checks++
  }
  await assert.rejects(client.post('/api/v1/staff/invitations', {}), /Session ended/); checks++

  // 2. Token only in the JSON body, never in URL/query.
  const { invitationsService } = await server.ssrLoadModule('/src/services/invitations.service.ts')
  respond = () => ({ status: 200, data: { data: { invitation: { type: 'owner' }, user: {}, organization_id: 7 } } })
  await invitationsService.preview('secret-token-123')
  await invitationsService.acceptNew('secret-token-123', 'Ana', 'pass-1234', 'pass-1234')
  await invitationsService.acceptExisting('secret-token-123', 'pass-1234')
  for (const config of sent.splice(0)) {
    check(() => assert.equal(config.method, 'post'))
    check(() => assert.ok(!String(config.url).includes('secret-token'), 'token never in URL'))
    check(() => assert.ok(!JSON.stringify(config.params ?? {}).includes('secret-token')))
    check(() => assert.equal(JSON.parse(config.data).token, 'secret-token-123'))
  }
  check(() => assert.ok(!('email' in JSON.parse(sent.length ? sent[0].data : '{}')), 'accept never sends an e-mail'))

  // 3. Platform onboarding carries the Idempotency-Key header; payload is what the form built.
  const { platformService } = await server.ssrLoadModule('/src/services/platform.service.ts')
  respond = () => ({ status: 201, data: { data: { replayed: false } } })
  await platformService.onboard({ organization: { name: 'A', slug: 'a' }, restaurant: { name: 'R', slug: 'r' }, owner: { email: 'o@x.es' } }, 'key-1')
  const onboarding = sent.pop()
  check(() => assert.equal(onboarding.headers['Idempotency-Key'], 'key-1'))
  check(() => assert.equal(onboarding.url, '/api/v1/platform/restaurants'))
  check(() => assert.deepEqual(Object.keys(JSON.parse(onboarding.data)).sort(), ['organization', 'owner', 'restaurant']))

  // 4. Error codes → localized keys, including 403/429 domain codes.
  const { normalizeApiError } = await server.ssrLoadModule('/src/api/errors.ts')
  const { describeApiError } = await server.ssrLoadModule('/src/utils/error-message.ts')
  const err = (status, code) => normalizeApiError(new AxiosError('x', '', {}, null, { status, data: { error: { code, message: 'raw english' } }, headers: {}, config: {} }))
  const t = key => key
  for (const [status, code, key] of [
    [409, 'STAFF_ALREADY_MEMBER', 'staffInvitations.errors.alreadyMember'],
    [409, 'STAFF_MEMBERSHIP_INACTIVE', 'staffInvitations.errors.membershipInactive'],
    [409, 'INVITATION_ALREADY_PENDING', 'invitations.errors.alreadyPending'],
    [409, 'INVITATION_ACCOUNT_EXISTS', 'invitation.errors.accountExists'],
    [409, 'INVITATION_ASSIGNMENT_CONFLICT', 'invitation.errors.assignmentConflict'],
    [403, 'INVITATION_ACCOUNT_SUSPENDED', 'invitation.errors.accountSuspended'],
    [429, 'INVITATION_RESEND_TOO_SOON', 'invitations.errors.tooSoon'],
    [409, 'ORGANIZATION_HAS_OWNER', 'platform.onboarding.errors.hasOwner'],
  ]) check(() => assert.equal(describeApiError(err(status, code), t), key))
  check(() => assert.equal(describeApiError(err(403, 'SOMETHING_ELSE'), t), 'common.errors.forbidden'))

  // 5. Organization switch: PUT first, restaurant context wiped, then reloaded for the new org.
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts')
  const { useRestaurantStore } = await server.ssrLoadModule('/src/stores/restaurant.ts')
  const { authService } = await server.ssrLoadModule('/src/services/auth.service.ts')
  const { restaurantsService } = await server.ssrLoadModule('/src/services/restaurants.service.ts')
  setActivePinia(createPinia())
  const auth = useAuthStore()
  const restaurants = useRestaurantStore()
  const ctx = (active, restaurantId) => ({ active_organization_id: active, platform: { permissions: [] }, organizations: [
    { id: 1, status: 'active', permissions: [], restaurants: [{ id: 10, status: 'active', permissions: ['create_orders'] }] },
    { id: 2, status: 'active', permissions: ['manage_users'], restaurants: [{ id: 20, status: 'active', permissions: ['manage_users'] }] },
  ].map(o => ({ ...o, restaurants: o.restaurants.filter(r => restaurantId === undefined || r.id === restaurantId || o.id !== active) })) })
  auth.user = { id: 5, name: 'Multi', email: 'm@x.es' }
  auth.authContext = ctx(1)
  restaurantsService.list = async () => [{ id: 10, name: 'A' }]
  await restaurants.load()
  check(() => assert.equal(restaurants.currentRestaurantId, 10))
  const order = []
  authService.selectOrganization = async id => { order.push(`put:${id}`) }
  authService.context = async () => { order.push('context'); return ctx(2) }
  restaurantsService.list = async () => { order.push('list'); return [{ id: 20, name: 'B' }] }
  restaurantsService.settings = async () => ({})
  const switching = auth.switchOrganization(2)
  check(() => assert.equal(auth.switchingOrganization, true))
  await switching
  check(() => assert.deepEqual(order, ['put:2', 'context', 'list']))
  check(() => assert.equal(restaurants.currentRestaurantId, 20))
  check(() => assert.deepEqual(restaurants.restaurants.map(r => r.id), [20]))
  check(() => assert.equal(localStorage.getItem('aforo-restaurant-id'), '20'))
  order.length = 0
  await auth.switchOrganization(2) // already active → no request
  check(() => assert.deepEqual(order, []))
  authService.selectOrganization = async () => { throw new AxiosError('x', '', {}, null, { status: 404, data: {}, headers: {}, config: {} }) }
  await assert.rejects(auth.switchOrganization(99)); checks++
  check(() => assert.equal(restaurants.currentRestaurantId, 20), 'failed switch keeps current context')

  // 6. Staff invitations composable: no double submit, stale responses dropped on restaurant switch.
  const { useStaffInvitations } = await server.ssrLoadModule('/src/composables/useStaffInvitations.ts')
  let inviteCalls = 0
  const inviteResult = deferred()
  invitationsService.listStaff = async () => []
  invitationsService.inviteStaff = async payload => { inviteCalls++; check(() => assert.ok(!('password' in payload))); return inviteResult.promise }
  // effectScope (not SSR): watchers must stay reactive for the switch check.
  const scope = effectScope()
  const composable = scope.run(() => useStaffInvitations(() => true))
  const payload = { name: 'Ana', email: 'ana@x.es', role: 'waiter', restaurant_assignments: [{ restaurant_id: 20 }] }
  const one = composable.invite(payload), two = composable.invite(payload)
  inviteResult.resolve({ id: 1, state: 'pending', email: 'ana@x.es' })
  await Promise.all([one, two])
  check(() => assert.equal(inviteCalls, 1))
  check(() => assert.equal(composable.invitations.value.length, 1))
  const lateList = deferred()
  let listCalls = 0
  invitationsService.listStaff = () => (++listCalls === 1 ? lateList.promise : Promise.resolve([{ id: 7, state: 'pending', email: 'new@org.es' }]))
  composable.refresh()
  restaurants.currentRestaurantId = 10 // switch → generation bump + abort
  lateList.resolve([{ id: 99, state: 'pending', email: 'old@org.es' }])
  await new Promise(r => setTimeout(r, 0))
  check(() => assert.ok(!composable.invitations.value.some(i => i.id === 99), 'stale list from previous context dropped'))
  check(() => assert.deepEqual(composable.invitations.value.map(i => i.id), [7]))
  scope.stop()

  // 7. Router: platform admin without orgs → platform; staff cannot reach /platform; /invitation open to both.
  const { default: router } = await server.ssrLoadModule('/src/router/index.ts')
  setActivePinia(createPinia())
  authService.me = async () => ({ id: 1, name: 'Admin', email: 'a@x.es' })
  authService.context = async () => ({ active_organization_id: null, organizations: [], platform: { is_platform_admin: true, roles: ['super_admin'], permissions: ['create_platform_restaurants'] } })
  await router.replace({ path: '/app/dashboard', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'platform-onboarding'))
  await router.replace({ path: '/login', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'platform-onboarding'))
  await router.replace({ path: '/invitation', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'invitation-accept'))

  setActivePinia(createPinia())
  authService.context = async () => ({ active_organization_id: 1, organizations: [{ id: 1, status: 'active', permissions: [], restaurants: [{ id: 1, status: 'active', permissions: ['update_kitchen_status'] }] }], platform: { is_platform_admin: false, roles: [], permissions: [] } })
  restaurantsService.list = async () => [{ id: 1 }]
  await router.replace({ path: '/platform/onboarding', force: true })
  check(() => assert.notEqual(router.currentRoute.value.name, 'platform-onboarding'))
  await router.replace({ path: '/invitation', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'invitation-accept'))

  setActivePinia(createPinia())
  authService.me = async () => { throw new AxiosError('x', '', {}, null, { status: 401, data: {}, headers: {}, config: {} }) }
  await router.replace({ path: '/invitation', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'invitation-accept'), 'guest reaches invitation page')
  await router.replace({ path: '/platform/onboarding', force: true })
  check(() => assert.equal(router.currentRoute.value.name, 'login'))

  console.log(`PASS: ${checks} invitation/onboarding checks (local doubles; views are placeholders)`)
} finally {
  await server.close()
}
