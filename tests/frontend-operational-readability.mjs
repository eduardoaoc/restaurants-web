// Phase 3.1K-B2 - operational readability: content-based camera framing, edge clamp, safe areas, overlay hierarchy,
// wall cutaway and label density. Pure and fixture based: no browser, no backend.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const fit = await server.ssrLoadModule('/src/components/restaurant-3d/camera-fit.ts')
  const framing = await server.ssrLoadModule('/src/components/restaurant-3d/framing.ts')
  const metrics = await server.ssrLoadModule('/src/components/restaurant-3d/overlay-metrics.ts')
  const tiers = await server.ssrLoadModule('/src/components/restaurant-3d/operational-hierarchy.ts')
  const cut = await server.ssrLoadModule('/src/components/restaurant-3d/wall-cutaway.ts')
  const viewport = await server.ssrLoadModule('/src/components/restaurant-3d/overlay-viewport.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')

  const sizes = [[390, 654], [375, 477], [918, 680], [1078, 680]]

  check('framing fits every point, or hits the distance cap; the clamp then keeps every pill fully inside the canvas', () => {
    const none = { left: 0, right: 0, top: 0, bottom: 0 }
    for (const [width, height] of sizes) {
      const viewportWidth = width <= 640 ? width : width + 48
      const frame = framing.frameRestaurant({ tables: mockLayout.tables, entrance: { x: 0, z: 6.5 }, width, height, viewportWidth })
      const m = metrics.overlayMetrics(viewportWidth)
      const input = { target: frame.target, direction: frame.direction, fov: framing.CAMERA_FOV, width, height }
      const capped = frame.distance >= 40 - 1e-6
      for (const table of mockLayout.tables) {
        for (const p of metrics.tableFramingPoints(table, m)) {
          const s = fit.projectToCanvas(p, input, frame.distance)
          if (!capped) {
            assert.ok(s.x - p.padX >= -0.5 && s.x + p.padX <= width + 0.5, `${table.id} x ${Math.round(s.x)} at ${width}px`)
            assert.ok(s.y - p.padTop >= -0.5 && s.y + p.padBottom <= height + 0.5, `${table.id} y ${Math.round(s.y)} at ${width}px`)
          }
          // Pill-bearing points (guest seats, table anchor): the pill, centred there, must end inside the canvas.
          if (p.padTop > m.edge + m.labelHalfHeight) {
            const pill = { width: m.pillHalfWidth * 2, height: 28 }
            const c = metrics.clampOverlay({ x: s.x, y: s.y }, pill, { width, height }, none, m.edge)
            assert.ok(c.x - pill.width / 2 >= m.edge - 0.5 && c.x + pill.width / 2 <= width - m.edge + 0.5, `${table.id} pill x at ${width}px`)
            assert.ok(Math.abs(c.x - s.x) <= m.pillHalfWidth, 'a pill never slides further than its own half width')
          }
        }
      }
    }
  })

  check('the fitted distance is the nearest one: a hair closer no longer fits', () => {
    const frame = framing.frameRestaurant({ tables: mockLayout.tables, width: 390, height: 654, viewportWidth: 390 })
    const m = metrics.overlayMetrics(390)
    const input = {
      points: mockLayout.tables.flatMap(t => metrics.tableFramingPoints(t, m)), target: frame.target, direction: frame.direction,
      fov: framing.CAMERA_FOV, width: 390, height: 654, minDistance: 11, maxDistance: 38,
    }
    const wide = framing.frameRestaurant({ tables: mockLayout.tables, width: 1078, height: 680, viewportWidth: 1440 })
    const wm = metrics.overlayMetrics(1440)
    const wideInput = { ...input, points: mockLayout.tables.flatMap(t => metrics.tableFramingPoints(t, wm)), target: wide.target, direction: wide.direction, width: 1078, height: 680 }
    assert.equal(fit.framingFits(wideInput, wide.distance), true)
    assert.equal(fit.framingFits(wideInput, wide.distance - 0.2), false)
  })

  check('safe-area insets push the camera back instead of clipping', () => {
    const base = framing.frameRestaurant({ tables: mockLayout.tables, width: 600, height: 640, viewportWidth: 600 })
    const notch = framing.frameRestaurant({ tables: mockLayout.tables, width: 600, height: 640, viewportWidth: 600, insets: { left: 47, right: 47, top: 0, bottom: 0 } })
    assert.ok(notch.distance > base.distance)
  })

  check('a narrower canvas never frames closer than a wider one', () => {
    const wide = framing.frameRestaurant({ tables: mockLayout.tables, width: 918, height: 680, viewportWidth: 1280 })
    const narrow = framing.frameRestaurant({ tables: mockLayout.tables, width: 390, height: 654, viewportWidth: 390 })
    assert.ok(narrow.distance > wide.distance)
  })

  check('an empty layout and the editor frame the whole floor', () => {
    const empty = framing.frameRestaurant({ tables: [], width: 918, height: 680, viewportWidth: 1280 })
    const editing = framing.frameRestaurant({ tables: mockLayout.tables, includeFloor: true, width: 918, height: 680, viewportWidth: 1280 })
    const tablesOnly = framing.frameRestaurant({ tables: mockLayout.tables, width: 918, height: 680, viewportWidth: 1280 })
    assert.ok(Number.isFinite(empty.distance) && empty.distance >= 11 && empty.distance <= 38)
    assert.ok(editing.distance >= tablesOnly.distance)
  })

  check('degenerate canvases never produce NaN', () => {
    for (const [w, h] of [[0, 0], [NaN, 100], [10, 10]]) {
      const frame = framing.frameRestaurant({ tables: mockLayout.tables, width: w, height: h, viewportWidth: 390 })
      assert.ok(Number.isFinite(frame.distance))
    }
  })

  check('cameraFit is unchanged', () => {
    assert.equal(fit.cameraFit(2), 1)
    assert.ok(fit.cameraFit(0.6) > 1.5 && fit.cameraFit(0.6) <= 2.1)
  })

  const canvas = { width: 390, height: 654 }
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  check('edge clamp nudges a pill inside the canvas and keeps it readable', () => {
    const pill = { width: 129, height: 28 }
    const out = metrics.clampOverlay({ x: 380, y: 300 }, pill, canvas, none, 6)
    assert.equal(out.x, 390 - 6 - 129 / 2)
    assert.equal(out.y, 300)
    const left = metrics.clampOverlay({ x: 10, y: 300 }, pill, canvas, none, 6)
    assert.equal(left.x, 6 + 129 / 2)
  })
  check('edge clamp respects safe-area insets', () => {
    const out = metrics.clampOverlay({ x: 385, y: 300 }, { width: 100, height: 28 }, canvas, { ...none, right: 47 }, 6)
    assert.equal(out.x, 390 - 47 - 6 - 50)
  })
  check('an overlay whose table is really off screen is not pinned to the edge', () => {
    const out = metrics.clampOverlay({ x: 700, y: 300 }, { width: 100, height: 28 }, canvas, none, 6)
    assert.equal(out.x, 700)
    assert.equal(metrics.clampOverlay({ x: 200, y: -300 }, { width: 100, height: 28 }, canvas, none, 6).y, -300)
  })
  check('an overlay wider than the canvas is left alone rather than jittering', () => {
    const out = metrics.clampOverlay({ x: 50, y: 50 }, { width: 500, height: 28 }, { width: 390, height: 654 }, none, 6)
    assert.equal(out.x, 50)
  })
  check('safe-area insets are measured against the canvas rectangle', () => {
    const inset = metrics.canvasSafeInsets({ left: 0, right: 844, top: 0, bottom: 390 }, { width: 844, height: 390 }, { left: 47, right: 47, top: 0, bottom: 21 })
    assert.deepEqual(inset, { left: 47, right: 47, top: 0, bottom: 21 })
    const inner = metrics.canvasSafeInsets({ left: 60, right: 790, top: 0, bottom: 300 }, { width: 844, height: 390 }, { left: 47, right: 47, top: 0, bottom: 21 })
    assert.deepEqual(inner, { left: 0, right: 0, top: 0, bottom: 0 })
  })

  check('overlay hierarchy follows the required order and keeps z ranges disjoint', () => {
    assert.equal(tiers.eventTier('critical', 'urgent'), 1)
    assert.equal(tiers.eventTier('critical', 'checkout'), 1)
    assert.equal(tiers.eventTier('attention', 'urgent'), 2)
    assert.equal(tiers.eventTier('attention', 'attention'), 3)
    assert.equal(tiers.eventTier('info', 'checkout'), 4)
    assert.equal(tiers.eventTier('info', 'active'), 5)
    assert.equal(tiers.flagTier('urgent'), 2)
    assert.equal(tiers.flagTier('attention'), 3)
    assert.equal(tiers.flagTier('checkout'), 4)
    for (let t = 1; t < 5; t++) assert.ok(tiers.tierZRange(t)[1] > tiers.tierZRange(t + 1)[0], `tier ${t} over ${t + 1}`)
    assert.ok(tiers.tierZRange(5)[1] > tiers.LABEL_Z_RANGE[0], 'labels sit under every pill')
    assert.ok(tiers.tierRimPx(1) > tiers.tierRimPx(5))
  })

  check('walls facing the camera are lowered, the far ones stay', () => {
    const south = { outward: [0, 1], x: -4, z: 7.25, kind: 'wall' }
    const north = { outward: [0, -1], x: -4, z: -7.25, kind: 'wall' }
    assert.equal(cut.cutawayTarget(south, 8, 12.5), cut.WALL_CUTAWAY_SCALE)
    assert.equal(cut.cutawayTarget(north, 8, 12.5), 1)
    assert.equal(cut.cutawayTarget(south, 0, -12), 1, 'orbiting behind flips them')
    assert.equal(cut.cutawayTarget(north, 0, -12), cut.WALL_CUTAWAY_SCALE)
    let v = 1
    for (let i = 0; i < 60; i++) v = cut.easeCutaway(v, cut.WALL_CUTAWAY_SCALE, 1 / 60)
    assert.equal(v, cut.WALL_CUTAWAY_SCALE)
  })

  check('label detail has hysteresis', () => {
    viewport.updateOverlayDensity(50); assert.equal(viewport.overlayViewport.labelDetail, true)
    viewport.updateOverlayDensity(viewport.LABEL_DETAIL_HIDE_PX_PER_M - 1); assert.equal(viewport.overlayViewport.labelDetail, false)
    viewport.updateOverlayDensity(viewport.LABEL_DETAIL_HIDE_PX_PER_M + 1); assert.equal(viewport.overlayViewport.labelDetail, false, 'no flicker inside the band')
    viewport.updateOverlayDensity(viewport.LABEL_DETAIL_SHOW_PX_PER_M); assert.equal(viewport.overlayViewport.labelDetail, true)
  })

  console.log(`frontend-operational-readability: ${checks} checks passed`)
} finally {
  await server.close()
}
