import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { fn(); checks++ }
try {
  const env = await server.ssrLoadModule('/src/config/env.ts')
  const { mapOperationsFloor } = await server.ssrLoadModule('/src/components/restaurant-3d/operations-floor-mapper.ts')
  const guard = await server.ssrLoadModule('/src/components/restaurant-3d/scene-runtime-guard.ts')

  // ---- VITE_DASHBOARD_3D --------------------------------------------------------------------------------------------
  const secureBase = { VITE_API_URL: 'https://api.example.invalid', VITE_PUBLIC_APP_URL: 'https://qa.example.invalid' }
  const resolve = (extra, mode = 'development') => env.validateEnv(mode === 'development' ? extra : { ...secureBase, ...extra }, mode)
  check('unset → kaykit, no fallback notice, in every build target', () => {
    for (const mode of ['development', 'staging', 'production']) {
      const r = resolve({}, mode)
      assert.equal(r.dashboard3d, 'kaykit'); assert.equal(r.dashboard3dFallback, null)
    }
  })
  check('off and kaykit are honoured everywhere', () => {
    for (const mode of ['development', 'staging', 'production']) {
      assert.equal(resolve({ VITE_DASHBOARD_3D: 'off' }, mode).dashboard3d, 'off')
      assert.equal(resolve({ VITE_DASHBOARD_3D: 'kaykit' }, mode).dashboard3d, 'kaykit')
    }
  })
  check('value is trimmed and case-insensitive', () => {
    assert.equal(resolve({ VITE_DASHBOARD_3D: '  OFF ' }).dashboard3d, 'off')
    assert.equal(resolve({ VITE_DASHBOARD_3D: 'Ultimate' }).dashboard3d, 'ultimate')
  })
  check('invalid values fall back to kaykit with a notice and never fail the build', () => {
    for (const value of ['garbage', 'true', '1', 'ultimate!', 'on', 'kay kit']) {
      const r = resolve({ VITE_DASHBOARD_3D: value }, 'production')
      assert.equal(r.dashboard3d, 'kaykit', value); assert.equal(r.dashboard3dFallback, 'invalid-value', value)
    }
  })
  check('ultimate is allowed in a local build without the QA flag', () => {
    const r = resolve({ VITE_DASHBOARD_3D: 'ultimate' }, 'development')
    assert.equal(r.dashboard3d, 'ultimate'); assert.equal(r.dashboard3dFallback, null)
  })
  check('ultimate in staging/production WITHOUT the QA flag is refused safely (kaykit + notice)', () => {
    for (const mode of ['staging', 'production']) {
      for (const qa of [undefined, '', 'false', '1', 'TRUE', 'yes']) {
        const r = resolve({ VITE_DASHBOARD_3D: 'ultimate', ...(qa === undefined ? {} : { VITE_ENABLE_ULTIMATE_DASHBOARD_QA: qa }) }, mode)
        assert.equal(r.dashboard3d, 'kaykit', `${mode}/${qa}`); assert.equal(r.dashboard3dFallback, 'ultimate-requires-qa-flag', `${mode}/${qa}`)
      }
    }
  })
  check('ultimate in staging/production WITH the exact QA flag is allowed', () => {
    for (const mode of ['staging', 'production']) {
      const r = resolve({ VITE_DASHBOARD_3D: 'ultimate', VITE_ENABLE_ULTIMATE_DASHBOARD_QA: 'true' }, mode)
      assert.equal(r.dashboard3d, 'ultimate'); assert.equal(r.dashboard3dFallback, null)
    }
  })
  check('the QA flag alone never turns ultimate on', () => {
    assert.equal(resolve({ VITE_ENABLE_ULTIMATE_DASHBOARD_QA: 'true' }, 'production').dashboard3d, 'kaykit')
  })
  check('the isolated fixture preview switch is independent of the Dashboard setting (both directions)', () => {
    for (const mode of ['development', 'production']) {
      for (const requested of [undefined, 'off', 'kaykit', 'ultimate']) {
        const base = requested ? { VITE_DASHBOARD_3D: requested } : {}
        const a = resolve(base, mode), b = resolve({ ...base, VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW: 'true' }, mode)
        assert.deepEqual([a.dashboard3d, a.dashboard3dFallback], [b.dashboard3d, b.dashboard3dFallback])
      }
    }
    const source = readFileSync('src/config/env.ts', 'utf8') + readFileSync('src/views/operation/OperationView.vue', 'utf8')
    assert.equal(/(read\(|import\.meta\.env\.)\s*'?VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW/.test(source), false, 'neither the env resolver nor the Dashboard reads the preview switch')
    const router = readFileSync('src/router/index.ts', 'utf8')
    assert.match(router, /VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW === 'true'/)
    assert.equal(/DASHBOARD_3D/.test(router), false, 'the preview route does not depend on the Dashboard setting')
  })

  // ---- table ↔ scene mapping with incomplete or invalid links (reuses mapOperationsFloor) ----------------------------
  const opTable = (id, extra = {}) => ({ id, name: `T${id}`, number: id, capacity: 4, zone_id: null, layout: {}, primary_status: 'free', flags: [], session: null, orders: {}, billing: null, ...extra })
  const snapshot = (restaurantId, tables) => ({ restaurant: { id: restaurantId, name: 'R', timezone: 'Europe/Madrid', currency: 'EUR' }, floors: [{ zones: [{ tables }] }], unassigned_tables: [], alerts: [] })
  const lay = (id, backendTableId, seats = 4) => ({ id, backendTableId, number: 1, seats, shape: 'round', position: { x: 0, z: 0 }, rotation: 0 })
  check('a layout table with no backend id, or an id the snapshot lacks, gets no operational layer; a snapshot table with no layout stays listable', () => {
    const layout = { tables: [lay('a', 1), lay('b', undefined), lay('c', 99)] }
    const snap = snapshot(3, [opTable(1), opTable(2)])
    const m = mapOperationsFloor(layout, snap, 3)
    assert.deepEqual(Object.keys(m.state), ['a'])
    assert.deepEqual(m.invalidLayoutIds, ['c'], 'unlinked (b) is simply absent; a dangling id (c) is reported')
    const linked = new Set(layout.tables.flatMap(t => (t.backendTableId == null ? [] : [t.backendTableId])))
    assert.deepEqual([opTable(1), opTable(2)].filter(t => !linked.has(t.id)).map(t => t.id), [2], 'table 2 is outside the scene')
  })
  check('incomplete session data fails closed per table, never for the whole room', () => {
    const occupied = (guests, openedAt = '2026-11-17T10:00:00Z') => opTable(2, { primary_status: 'occupied', session: { id: 9, status: 'occupied', opened_at: openedAt, guest_count: guests } })
    const layout = { tables: [lay('ok', 1), lay('bad', 2, 2)] }
    assert.deepEqual(Object.keys(mapOperationsFloor(layout, snapshot(3, [opTable(1), occupied(3)]), 3).state), ['ok'], 'more guests than seats')
    assert.deepEqual(Object.keys(mapOperationsFloor(layout, snapshot(3, [opTable(1), occupied(1, 'not-a-date')]), 3).state), ['ok'], 'bad opened_at')
    assert.deepEqual(Object.keys(mapOperationsFloor(layout, snapshot(3, [opTable(1), opTable(2, { primary_status: 'occupied', session: null })]), 3).state), ['ok'], 'occupied without a session')
    assert.deepEqual(Object.keys(mapOperationsFloor(layout, snapshot(3, [opTable(1), opTable(2, { primary_status: 'mystery' })]), 3).state), ['ok'], 'unknown status')
    assert.deepEqual(Object.keys(mapOperationsFloor(layout, snapshot(3, [opTable(1), occupied(2)]), 3).state).sort(), ['bad', 'ok'], 'valid data maps')
  })
  check('after a restaurant switch a stale snapshot of the previous restaurant maps nothing', () => {
    const layout = { tables: [lay('a', 1)] }
    const stale = mapOperationsFloor(layout, snapshot(3, [opTable(1)]), 4)
    assert.deepEqual(stale.state, {}); assert.deepEqual(stale.invalidLayoutIds, ['a'])
    assert.deepEqual(Object.keys(mapOperationsFloor(layout, snapshot(4, [opTable(1)]), 4).state), ['a'])
  })

  // ---- WebGL probe -----------------------------------------------------------------------------------------------------
  check('supportsWebGL: context available, unavailable, or throwing', () => {
    const doc = getContext => ({ createElement: () => ({ getContext }) })
    assert.equal(guard.supportsWebGL(doc(type => (type === 'webgl2' ? {} : null))), true)
    assert.equal(guard.supportsWebGL(doc(type => (type === 'webgl' ? {} : null))), true, 'falls back to webgl1')
    assert.equal(guard.supportsWebGL(doc(() => null)), false)
    assert.equal(guard.supportsWebGL(doc(() => { throw new Error('blocked') })), false)
  })

  // ---- wiring (static): the Dashboard reuses the existing selection and fallback paths ----------------------------------
  const view = readFileSync('src/views/operation/OperationView.vue', 'utf8')
  check('OperationView keeps the existing selection, fallback and realtime paths and adds the guard + environment', () => {
    for (const needle of ['@table-selected="selectSceneTable"', 'selectTable(table)', "environment=\"sceneMode === 'ultimate' ? 'ultimate' : 'kaykit'\"", '<SceneRuntimeGuard', 'tablesOutsideScene', 'sceneChunkFailed', "event?.name === 'floor_plan.updated'", 'showScene = computed(() => threeDEnabled.value && floorView.value === \'3d\')']) {
      assert.ok(view.includes(needle), needle)
    }
    assert.equal((view.match(/useRestaurantRealtime\(/g) ?? []).length, 0, 'OperationView adds no realtime subscription')
  })
  // ---- run-time fallback, Centrar vista and short-screen wiring (static: the behaviour is browser-verified) ---------------------
  check('guard: grace period, failure reasons, provide/inject key and the scene reporting its canvas error', () => {
    assert.equal(guard.CONTEXT_RESTORE_GRACE_MS, 2500)
    assert.equal(typeof guard.SCENE_FAILURE_KEY, 'symbol')
    const guardSfc = readFileSync('src/components/restaurant-3d/SceneRuntimeGuard.vue', 'utf8')
    for (const needle of ['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror', 'onErrorCaptured', 'provide(SCENE_FAILURE_KEY', "emit('failed', reason)", 'if (reported) return']) assert.ok(guardSfc.includes(needle), needle)
    const scene = readFileSync('src/components/restaurant-3d/RestaurantScene.vue', 'utf8')
    assert.ok(scene.includes("inject(SCENE_FAILURE_KEY, null)"), 'without a guard (fixture, editor) the scene reports to nobody')
    assert.ok(scene.includes("@error=\"reportSceneFailure?.('context-creation')\""))
  })
  check('the Dashboard recentres through the command channel and the scene only obeys it on the stage', () => {
    const scene = readFileSync('src/components/restaurant-3d/RestaurantScene.vue', 'utf8')
    assert.ok(scene.includes('watch(() => sceneCommands.recenter, () => { if (props.stage) recenterView() })'))
    assert.ok(scene.includes('v-if="!stage"'), "the scene's own dark Centrar vista button stays off the stage")
    assert.ok(view.includes('sceneCommands.recenter++'))
  })
  check('the JS "wide" media query and the CSS stage query are the same, so the card and the docks never disagree', () => {
    const query = '(min-width: 768px) and (min-height: 521px)'
    assert.ok(view.includes(`window.matchMedia('${query}')`))
    assert.ok(view.includes(`@media ${query} {`))
    assert.ok(readFileSync('src/components/dashboard/operation/stage/stage.css', 'utf8').includes('@media (max-height: 520px)'))
  })
  check('a restaurant switch clears a run-time failure and undoes only the automatic Plan fallback', () => {
    assert.match(view, /watch\(\(\) => props\.restaurantId, \(\) => \{\s+sceneRuntimeFailure\.value = null\s+if \(!userChoseView\.value && threeDEnabled\.value\) floorView\.value = '3d'/)
    assert.match(view, /function setFloorView[\s\S]*sceneRuntimeFailure\.value = null/)
  })
  check('off: the scene chunk, the layout request and the view selector are all skipped', () => {
    assert.ok(view.includes("const floorView = ref<'plan' | '3d'>(threeDEnabled.value ? '3d' : 'plan')"))
    assert.ok(view.includes('const layoutRestaurantId = computed(() => showScene.value && props.snapshot'))
    assert.ok(readFileSync('src/components/dashboard/operation/stage/StageTopbar.vue', 'utf8').includes('v-if="views.length > 1"'))
  })
  console.log(`frontend-dashboard-3d: ${checks} checks passed`)
} finally {
  await server.close()
}
