// Phase 3.1K-D2B - camera range of the Ultimate demo: the finite world's ends can never be in view, on any viewport.
// Pure maths, no browser: samples every permitted camera pose (distance x azimuth x polar x pan target) and projects the
// ends of the road / sidewalks / hedge through a real perspective camera, discounting what the fog has already dissolved.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const lim = await server.ssrLoadModule('/src/components/restaurant-3d/camera-limits.ts')
  const urban = await server.ssrLoadModule('/src/components/restaurant-3d/urban-plan.ts')
  const fr = await server.ssrLoadModule('/src/components/restaurant-3d/framing.ts')
  const { ultimateDemoLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/ultimate-demo.ts')

  const entrances = { west: { x: -9.4, z: 3.1 }, east: { x: 9.4, z: -2.3 }, north: { x: 4.2, z: -7.4 }, south: { x: -5.5, z: 7.6 } }
  const viewports = [
    ['desktop 1440x900', 1440, 900], ['desktop 1280x900', 1280, 900], ['phone portrait 390x844', 390, 844],
    ['phone portrait 375x667', 375, 667], ['phone landscape 844x390', 844, 390], ['tablet 768x1024', 768, 1024],
  ]
  const overview = (plan, entrance, w, h) => fr.frameRestaurant({
    tables: ultimateDemoLayout.tables, entrance, includeFloor: true, context: urban.contextPoints(plan), wallHeight: 3, maxDistance: 70,
    width: w, height: h, viewportWidth: w,
  }).distance

  check('limits scale with the viewport: a tall phone may zoom out further than a desktop, nobody past the hard cap', () => {
    const plan = urban.planUrban(entrances.south)
    const desktop = lim.cameraLimits(overview(plan, entrances.south, 1440, 900))
    const phone = lim.cameraLimits(overview(plan, entrances.south, 390, 844))
    assert.ok(phone.maxDistance > desktop.maxDistance, 'phone portrait needs a longer range than a desktop')
    for (const [, w, h] of viewports) {
      const l = lim.cameraLimits(overview(plan, entrances.south, w, h))
      assert.ok(l.minDistance >= 5 && l.minDistance < l.maxDistance, 'sane min/max')
      assert.ok(l.maxDistance <= lim.HARD_MAX_DISTANCE, 'hard cap')
      assert.ok(l.maxPolar < Math.PI / 2 - 0.2 && l.minPolar > 0, 'never the horizon, never the pole')
    }
    assert.equal(lim.cameraLimits(NaN).maxDistance > 0, true, 'a missing fit falls back to a sane range')
  })

  check('the zoom-out limit leaves the whole overview reachable (never clamps the fitted default view)', () => {
    for (const [name, w, h] of viewports) for (const e of Object.values(entrances)) {
      const fit = overview(urban.planUrban(e), e, w, h)
      assert.ok(lim.cameraLimits(fit).maxDistance >= fit - 1e-9, `${name}: the fit ${fit.toFixed(1)} is inside the range`)
    }
  })

  check('orbit target clamp: inside is untouched, outside is pulled back and reports the shift', () => {
    assert.deepEqual(lim.clampTarget({ x: 1, y: 0.4, z: 2 }), { dx: 0, dy: 0, dz: 0 })
    const c = lim.clampTarget({ x: 40, y: 5, z: -30 })
    assert.equal(c.dx, lim.TARGET_BOUNDS.maxX - 40)
    assert.equal(c.dz, lim.TARGET_BOUNDS.minZ + 30)
    assert.equal(c.dy, lim.TARGET_BOUNDS.maxY - 5)
  })

  // ---- exposure sampling ----------------------------------------------------------------------------------------------
  const FOV = (35 * Math.PI) / 180
  const project = (cam, target, aspect, p) => {
    // camera basis
    const f = [target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]
    const fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl
    let r = [f[2], 0, -f[0]]; const rl = Math.hypot(...r); r = r.map(v => v / rl)
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
    const v = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]]
    const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]
    if (z <= 0.1) return null
    const t = Math.tan(FOV / 2)
    return { x: (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (z * t * aspect), y: (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (z * t), dist: Math.hypot(...v) }
  }
  const fogAmount = d => Math.min(1, Math.max(0, (d - lim.WORLD_FOG.near) / (lim.WORLD_FOG.far - lim.WORLD_FOG.near)))
  /** World points where the finite world ends: both ends of the road, both pavements, the curbs and the far hedge. */
  const worldEnds = plan => {
    const pts = []
    for (const a of [plan.sidewalk.a0, plan.sidewalk.a1]) {
      for (const d of [0, urban.SIDEWALK_DEPTH, plan.road.d0, plan.road.d1, plan.farSidewalk.d0 + plan.farSidewalk.depth + 0.9]) {
        const p = urban.toWorld(plan.side, a, d)
        pts.push([p.x, 0, p.z], [p.x, 1, p.z])
      }
    }
    return pts
  }

  check('no end of the world is ever in view across the permitted camera range (6 viewports x 4 street walls)', () => {
    let poses = 0
    let worst = 0
    for (const [name, w, h] of viewports) {
      for (const [side, e] of Object.entries(entrances)) {
        const plan = urban.planUrban(e)
        const limits = lim.cameraLimits(overview(plan, e, w, h))
        const ends = worldEnds(plan)
        const B = limits.target
        const targets = [-1, 0, 1].flatMap(ix => [-1, 0, 1].map(iz => [ix < 0 ? B.minX : ix > 0 ? B.maxX : 0, 0.4, iz < 0 ? B.minZ : iz > 0 ? B.maxZ : 0]))
        for (const dist of [limits.minDistance, (limits.minDistance + limits.maxDistance) / 2, limits.maxDistance]) {
          for (const polar of [limits.minPolar, (limits.minPolar + limits.maxPolar) / 2, limits.maxPolar]) {
            for (let az = 0; az < 360; az += 10) {
              for (const t of targets) {
                poses++
                const a = (az * Math.PI) / 180
                const cam = [t[0] + dist * Math.sin(polar) * Math.sin(a), t[1] + dist * Math.cos(polar), t[2] + dist * Math.sin(polar) * Math.cos(a)]
                for (const p of ends) {
                  const s = project(cam, t, w / h, p)
                  if (!s || Math.abs(s.x) > 1.02 || Math.abs(s.y) > 1.02) continue
                  const visible = 1 - fogAmount(s.dist)
                  worst = Math.max(worst, visible)
                  assert.ok(visible < 0.1, `${name} ${side}: a world end is in view (dist ${dist.toFixed(0)}, polar ${polar.toFixed(2)}, az ${az}, ${(visible * 100).toFixed(0)}% visible)`)
                }
              }
            }
          }
        }
      }
    }
    console.log(`  exposure sampled on ${poses} poses, worst end visibility ${(worst * 100).toFixed(1)}%`)
  })

  console.log(`camera limits: ${checks} checks passed`)
} finally {
  await server.close()
}
