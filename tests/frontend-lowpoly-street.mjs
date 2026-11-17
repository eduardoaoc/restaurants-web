// Lowpoly street props (lamp post, door planters) in the Ultimate fixture: dev-only serving, plan hooks, model facts.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const urban = await server.ssrLoadModule('/src/components/restaurant-3d/urban-plan.ts')
  const exterior = readFileSync('src/components/restaurant-3d/UrbanExterior.vue', 'utf8')
  const vite = readFileSync('vite.config.ts', 'utf8')
  const router = readFileSync('src/router/index.ts', 'utf8')
  const preview = readFileSync('src/views/experiments/Restaurant3DUltimatePreviewView.vue', 'utf8')

  check('full-scene preview is compile-time opt-in and the dev fixture route stays dev-only', () => {
    assert.match(router, /import\.meta\.env\.VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW\s*===\s*'true'[\s\S]*?\$\{import\.meta\.env\.BASE_URL\}qa\/restaurant-3d-ultimate-preview/)
    assert.match(router, /import\.meta\.env\.DEV[\s\S]*?\/dev\/restaurant-3d-fixture/)
    assert.match(preview, /Restaurant3DFixtureView/)
    assert.match(preview, /<Restaurant3DFixtureView\s*\/>/)
  })

  check('exactly two door planters (1.1 m) per entrance; the larger ones stay procedural', () => {
    for (const e of [{ x: -9.4, z: 3.1 }, { x: 9.4, z: -2.3 }, { x: 4.2, z: -7.4 }, { x: -5.5, z: 7.6 }]) {
      const plan = urban.planUrban(e)
      const door = plan.planters.filter(p => Math.abs(p.w - urban.DOOR_PLANTER_WIDTH) < 1e-6)
      assert.equal(door.length, 2)
      assert.ok(Math.abs(Math.abs(door[0].a - door[1].a) - 2.9) < 1e-9, 'flank the doorway at +-1.45 m')
      assert.ok(plan.planters.length > 2, 'bigger planters still exist')
      // navigation footprints are untouched: every planter is still an outdoor obstacle rectangle
      assert.equal(plan.obstacles.filter(o => o.name === 'planter').length, plan.planters.length)
    }
  })

  check('the models are loaded from the base-aware static path, with a procedural fallback and a dev-only off switch', () => {
    assert.ok(exterior.includes('`${import.meta.env.BASE_URL}assets/restaurant-3d/models/lowpoly-street`'), 'base-aware URL')
    assert.ok(exterior.includes("import.meta.env.DEV && new URLSearchParams(window.location.search).get('lowpoly') === 'off'"), 'off switch only in dev builds')
    assert.ok(!/if \(!import\.meta\.env\.DEV/.test(exterior), 'no DEV guard on the load itself (production loads the authorized assets)')
    assert.ok(exterior.includes('keeping the procedural ones'), 'fallback on failure')
    assert.ok(exterior.includes('LAMP_SCALE = 0.9') && exterior.includes('PLANTER_SCALE = 0.91') && exterior.includes('LAMP_AXIS_Z = -0.49'))
    assert.ok(exterior.includes("lp_glass' ? materials.lampGlow"), 'warm emissive lens')
  })

  check('only UrbanExterior (mounted by the Ultimate scene alone) requests the models', () => {
    const hits = ['RestaurantScene.vue', 'UltimateEnvironment.vue', 'RestaurantEnvironment.vue', 'ultimate-instancing.ts', 'kaykit-asset-cache.ts']
      .filter(f => readFileSync(`src/components/restaurant-3d/${f}`, 'utf8').includes('lowpoly-street'))
    assert.deepEqual(hits, [])
    const scene = readFileSync('src/components/restaurant-3d/RestaurantScene.vue', 'utf8')
    assert.ok(scene.includes('<UrbanExterior v-if="urban"') && scene.includes("props.environment === 'ultimate' ? planUrban"))
  })

  check('shipped as static assets under public/ (exactly the two GLBs + a licence note); the vite middleware serves only the Ultimate pack', () => {
    const pub = 'public/assets/restaurant-3d/models/lowpoly-street'
    assert.deepEqual(readdirSync(pub).sort(), ['LICENSE-NOTE.txt', 'asset-props-lamp-post.glb', 'asset-props-planter.glb'])
    assert.equal(statSync(`${pub}/asset-props-lamp-post.glb`).size, 9876)
    assert.equal(statSync(`${pub}/asset-props-planter.glb`).size, 8428)
    assert.ok(!vite.includes('lowpoly-street') || /NOT served from here/.test(vite), 'no lowpoly mount in the dev middleware')
    assert.ok(!/localDemoMounts/.test(vite) && vite.includes('/assets/restaurant-3d/models/ultimate-pack/'), 'Ultimate dev route preserved')
  })

  const dir = 'public/assets/restaurant-3d/models/lowpoly-street'
  const parse = file => {
    const d = readFileSync(`${dir}/${file}`)
    const n = d.readUInt32LE(12)
    const json = JSON.parse(d.subarray(20, 20 + n).toString())
    let tris = 0
    for (const m of json.meshes) for (const p of m.primitives) tris += json.accessors[p.indices].count / 3
    return { bytes: d.length, json, tris }
  }
  if (existsSync(dir)) {
    check('GLB facts: sizes, triangles, material names the code maps, no textures', () => {
      const lamp = parse('asset-props-lamp-post.glb')
      const planter = parse('asset-props-planter.glb')
      assert.equal(lamp.bytes, 9876); assert.equal(lamp.tris, 100)
      assert.equal(planter.bytes, 8428); assert.equal(planter.tris, 100)
      assert.deepEqual(lamp.json.materials.map(m => m.name).sort(), ['lp_glass', 'lp_metal'])
      assert.deepEqual(planter.json.materials.map(m => m.name).sort(), ['lp_foliage', 'lp_trim'])
      for (const m of [lamp, planter]) assert.ok(!m.json.textures && !m.json.animations)
    })
  }
  console.log(`lowpoly street: ${checks} checks passed`)
} finally {
  await server.close()
}
