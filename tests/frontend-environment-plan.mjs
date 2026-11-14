// Phase 3.1K-C1 - KayKit room envelope plan: walls hug the persisted floor, doorway follows the entrance, service runs
// neither overlap nor leave the room, and navigation footprints are the drawn ones. Pure: no browser, no backend.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const plan = await server.ssrLoadModule('/src/components/restaurant-3d/environment-plan.ts')
  const nav = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/floor-nav.ts')
  const entranceCheck = await server.ssrLoadModule('/src/components/restaurant-3d/entrance-validation.ts')
  const { FLOOR } = await server.ssrLoadModule('/src/components/restaurant-3d/floor.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')
  const entrance = { x: -9.4, z: 3.1 }

  const spans = pieces => pieces.map(p => [p.along - (p.stretch * plan.WALL_MODULE) / 2, p.along + (p.stretch * plan.WALL_MODULE) / 2]).sort((a, b) => a[0] - b[0])

  check('every side is covered end to end with no gap or overlap', () => {
    for (const entry of [null, entrance, { x: 0, z: 7.6 }, { x: 9.6, z: -2 }]) {
      const pieces = plan.planWalls(entry)
      for (const side of ['north', 'south', 'east', 'west']) {
        const s = spans(pieces.filter(p => p.side === side))
        const [from, to] = plan.sideSpan(side)
        assert.ok(Math.abs(s[0][0] - from) < 1e-6 && Math.abs(s.at(-1)[1] - to) < 1e-6, `${side} ends`)
        for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i][0] - s[i - 1][1]) < 1e-6, `${side} joint ${i}`)
      }
    }
  })

  check('wall inner faces coincide with the persisted floor edge', () => {
    assert.equal(plan.WALL_CENTER_X - plan.WALL_THICKNESS / 2, FLOOR.width / 2)
    assert.equal(plan.WALL_CENTER_Z - plan.WALL_THICKNESS / 2, FLOOR.depth / 2)
  })

  check('plain modules stay within 0.7-1.35 stretch for the real entrance; windows only on near-natural modules', () => {
    for (const p of plan.planWalls(entrance)) {
      assert.ok(p.stretch >= 0.7 && p.stretch <= 1.35, `${p.side} ${p.stretch}`)
      if (p.kind === 'window') assert.ok(p.stretch > 0.88 && p.stretch < 1.12)
    }
  })

  check('entrance doorway is centred on the saved entrance, on the nearest wall', () => {
    const door = plan.planWalls(entrance).find(p => p.side === 'west' && p.kind === 'doorway')
    assert.ok(door && Math.abs(door.along - 3.1) < 1e-9)
    assert.equal(plan.entranceDoorway({ x: 0.5, z: 7.7 }).side, 'south')
    assert.equal(plan.entranceDoorway(null), null)
    assert.equal(plan.planWalls(null).filter(p => p.kind === 'doorway').length, 1, 'only the terrace doorway without an entrance')
  })

  check('terrace doorway stays on the east wall at z = 0.75', () => {
    const door = plan.planWalls(entrance).find(p => p.side === 'east' && p.kind === 'doorway')
    assert.equal(door.along, plan.TERRACE_DOOR_Z)
  })

  check('no window above the kitchen run', () => {
    for (const p of plan.planWalls(entrance)) if (p.side === 'north' && p.along < plan.KITCHEN_END_X) assert.notEqual(p.kind, 'window')
  })

  const rect = it => ({ x0: it.x - plan.SERVICE_MODULE / 2, x1: it.x + plan.SERVICE_MODULE / 2, z0: it.z - 1, z1: it.z + 1.04 })
  check('service modules: no overlaps, inside the room, backs on the north wall', () => {
    const all = [...plan.KITCHEN_ITEMS, ...plan.BAR_ITEMS].map(rect)
    all.forEach((a, i) => {
      assert.ok(a.x0 >= -FLOOR.width / 2 - 1e-6 && a.x1 <= FLOOR.width / 2 + 1e-6, 'inside x')
      assert.ok(a.z0 >= -FLOOR.depth / 2 - 1e-6, 'not through the north wall')
      all.slice(i + 1).forEach(b => assert.ok(a.x1 <= b.x0 + 1e-6 || b.x1 <= a.x0 + 1e-6, 'items overlap'))
    })
  })

  check('navigation obstacles are the drawn service footprints', () => {
    const k = nav.SERVICE_AREA_OBSTACLES.find(o => o.tableId === 'environment:kitchen')
    const b = nav.SERVICE_AREA_OBSTACLES.find(o => o.tableId === 'environment:bar')
    assert.deepEqual([k.x, k.z, k.hx, k.hz], [plan.KITCHEN_FOOTPRINT.x, plan.KITCHEN_FOOTPRINT.z, plan.KITCHEN_FOOTPRINT.hx, plan.KITCHEN_FOOTPRINT.hz])
    assert.ok(b.x - b.hx >= plan.KITCHEN_FOOTPRINT.x + plan.KITCHEN_FOOTPRINT.hx + 3, 'a >= 3 m passage between kitchen and bar')
  })

  check('no operational table of the mock layout is inside a service footprint (so no persisted position needs to change)', () => {
    const grid = nav.buildNavGrid(mockLayout.tables)
    for (const t of mockLayout.tables) {
      for (const o of nav.SERVICE_AREA_OBSTACLES) assert.equal(nav.insideObstacle(o, t.position.x, t.position.z, 1.2), false, `${t.id} vs ${o.tableId}`)
    }
    assert.equal(entranceCheck.validateEntranceGeometry(grid, entrance).ok, true, 'the saved entrance still has a free walking start')
    // Entrance -> every table approach point stays routable around the service runs.
    for (const t of mockLayout.tables) assert.ok(grid.findPath(entrance, { x: t.position.x, z: t.position.z + 1.9 }), `route to ${t.id}`)
  })

  console.log(`frontend-environment-plan: ${checks} checks passed`)
} finally {
  await server.close()
}
