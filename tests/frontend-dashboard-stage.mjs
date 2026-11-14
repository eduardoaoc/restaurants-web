// Dashboard 3D stage: the camera frames the whole room inside its margin, the light stage keeps status rings legible,
// and every stage string exists in all three locales. Pure: no browser, no backend.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const { frameRestaurant, CAMERA_FOV } = await server.ssrLoadModule('/src/components/restaurant-3d/framing.ts')
  const { projectToCanvas } = await server.ssrLoadModule('/src/components/restaurant-3d/camera-fit.ts')
  const { getRingBands, LIGHT_SELECTION_BANDS } = await server.ssrLoadModule('/src/components/restaurant-3d/ring-style.ts')
  const { VISUAL_PALETTE } = await server.ssrLoadModule('/src/components/restaurant-3d/visual-state.ts')
  const { FLOOR } = await server.ssrLoadModule('/src/components/restaurant-3d/floor.ts')
  const { LIGHT_STAGE } = await server.ssrLoadModule('/src/components/restaurant-3d/scene-appearance.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')

  const ISO = [0.17, 0.55, 0.82]
  for (const [width, height, insets] of [[1440, 842, { top: 76, right: 40, bottom: 72, left: 40 }], [1280, 720, { top: 104, right: 24, bottom: 96, left: 24 }], [375, 630, { top: 108, right: 12, bottom: 64, left: 12 }]]) {
    check(`the whole room (floor corners and wall tops) fits a ${width}x${height} stage inside its insets`, () => {
      const frame = frameRestaurant({ tables: mockLayout.tables, includeFloor: true, wallHeight: 2.4, maxDistance: 110, direction: ISO, width, height, viewportWidth: width, insets })
      for (const y of [0, 2.4]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const p = projectToCanvas({ x: sx * FLOOR.width / 2, y, z: sz * FLOOR.depth / 2 }, { target: frame.target, direction: frame.direction, fov: CAMERA_FOV, width, height }, frame.distance)
        assert.ok(p.x >= insets.left && p.x <= width - insets.right && p.y >= insets.top && p.y <= height - insets.bottom, `corner (${sx},${y},${sz}) at ${p.x.toFixed(0)},${p.y.toFixed(0)}`)
      }
    })
  }

  check('light stage rings use the saturated tone as the core, the dark scene keeps its pale core', () => {
    for (const state of ['active', 'attention', 'checkout', 'urgent']) {
      assert.equal(getRingBands(state, true)[0].color, VISUAL_PALETTE[state].glow)
      assert.equal(getRingBands(state)[0].color, VISUAL_PALETTE[state].core)
    }
    assert.deepEqual(getRingBands('neutral', true), [])
  })

  check('selection on the light stage is the brand orange', () => {
    assert.ok(LIGHT_SELECTION_BANDS.every(band => band.color === LIGHT_STAGE.accent))
  })

  const locales = {}
  for (const name of ['es-ES', 'en-GB', 'ca-ES-valencia']) locales[name] = (await server.ssrLoadModule(`/src/i18n/locales/${name}.ts`)).default
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' && v ? flat(v, `${p}${k}.`) : [`${p}${k}`])
  check('operations.board.stage and floor strings exist in every locale', () => {
    const base = flat({ stage: locales['es-ES'].operations.board.stage, floor: locales['es-ES'].operations.board.floor })
    for (const name of ['en-GB', 'ca-ES-valencia']) {
      const other = flat({ stage: locales[name].operations.board.stage, floor: locales[name].operations.board.floor })
      assert.deepEqual([...other].sort(), [...base].sort(), name)
    }
    for (const key of ['stage.legend', 'stage.table.manage', 'floor.showPlan', 'floor.sceneLoading']) assert.ok(base.includes(key), key)
  })

  console.log(`dashboard stage: ${checks} checks passed`)
} finally {
  await server.close()
}
