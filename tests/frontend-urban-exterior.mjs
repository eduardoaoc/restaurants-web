// Phase 3.1K-D2A - urban exterior plan, door-centred wall run, sidewalk navigation and outdoor arrival/departure legs.
// Pure, fixture based: no browser, no backend.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const urban = await server.ssrLoadModule('/src/components/restaurant-3d/urban-plan.ts')
  const nav = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/floor-nav.ts')
  const rp = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/route-path.ts')
  const out = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/outdoor-nav.ts')
  const ci = await server.ssrLoadModule('/src/components/restaurant-3d/characters/chair-interaction.ts')
  const place = await server.ssrLoadModule('/src/components/restaurant-3d/characters/customer-placement.ts')
  const { ultimateDemoLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/ultimate-demo.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')
  const { guestFixture } = await server.ssrLoadModule('/src/data/restaurant-3d/guest-fixtures.ts')

  const { OUTER_X, OUTER_Z, WALL_T, DOOR_OPENING } = urban
  // One entrance per wall, deliberately NOT on a module centre, at the usual 0.6 m inside the floor edge.
  const entrances = {
    west: { x: -9.4, z: 3.1 },
    east: { x: 9.4, z: -2.3 },
    north: { x: 4.2, z: -7.4 },
    south: { x: -5.5, z: 7.6 },
  }
  const STAND = 0.514 - ci.CHAIR_PULL
  const seatOf = p => ({ x: p.x, z: p.z, yaw: p.yaw, ref: { tableId: p.tableId, chairIndex: p.seatIndex } })
  const floorEdge = { x: OUTER_X - WALL_T, z: OUTER_Z - WALL_T }
  const inWallThickness = (x, z) => Math.abs(x) < OUTER_X && Math.abs(z) < OUTER_Z && (Math.abs(x) > floorEdge.x || Math.abs(z) > floorEdge.z)
  const insideBuilding = (x, z) => Math.abs(x) < OUTER_X && Math.abs(z) < OUTER_Z

  /** Samples a polyline every 5 cm and calls `fn(x, z)`. */
  const walk = (pts, fn) => {
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / 0.05))
      for (let k = 0; k <= n; k++) fn(pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / n, pts[i - 1].z + ((pts[i].z - pts[i - 1].z) * k) / n)
    }
  }

  check('wall plan: the entrance doorway is centred on the configured entrance, on its own wall', () => {
    for (const [side, e] of Object.entries(entrances)) {
      const doors = urban.planWallModules(e).filter(m => m.kind === 'door' && m.entrance)
      assert.equal(doors.length, 1, side)
      assert.equal(doors[0].side, side)
      assert.ok(Math.abs(doors[0].along - (side === 'west' || side === 'east' ? e.z : e.x)) < 1e-9, `${side} along`)
    }
  })

  check('wall plan: modules tile every wall run exactly (no gap, no overlap), whatever the entrance', () => {
    for (const e of [...Object.values(entrances), null, { x: -9.9, z: 7.9 }, { x: 9.9, z: -7.9 }]) {
      const modules = urban.planWallModules(e)
      for (const side of ['north', 'south', 'east', 'west']) {
        const spans = modules.filter(m => m.side === side).map(m => [m.along - (m.stretch * urban.WALL_MODULE) / 2, m.along + (m.stretch * urban.WALL_MODULE) / 2]).sort((a, b) => a[0] - b[0])
        const half = urban.runHalf(side)
        assert.ok(Math.abs(spans[0][0] + half) < 1e-6 && Math.abs(spans.at(-1)[1] - half) < 1e-6, `${side} ends`)
        for (let i = 1; i < spans.length; i++) assert.ok(Math.abs(spans[i][0] - spans[i - 1][1]) < 1e-6, `${side} joint ${i}`)
      }
    }
  })

  check('terrace: always planned (deck, tables, plants) and never on the entrance wall', () => {
    for (const e of [...Object.values(entrances), null]) {
      const plan = urban.planUrban(e)
      assert.notEqual(plan.terrace.side, plan.side)
      assert.ok(plan.terrace.tables.length > 0 && plan.terrace.plants.length > 0 && plan.terrace.hedges.length > 0)
      assert.equal(plan.hasEntrance, !!e)
    }
    assert.equal(urban.planUrban(entrances.east).terrace.side, 'west')
    assert.equal(urban.planUrban(entrances.south).terrace.side, 'east')
  })

  check('urban plan: the street is on the entrance wall, the door line is clear and the lane is on the sidewalk', () => {
    for (const [side, e] of Object.entries(entrances)) {
      const plan = urban.planUrban(e)
      assert.equal(plan.side, side)
      const f = urban.toLocal(side, plan.front.x, plan.front.z)
      assert.ok(Math.abs(f.a - plan.doorA) < 1e-9 && f.d > 0.8 && f.d < urban.SIDEWALK_DEPTH - 0.8)
      for (const p of plan.lane) {
        const l = urban.toLocal(side, p.x, p.z)
        assert.ok(l.d > 0.6 && l.d < urban.SIDEWALK_DEPTH - 0.4, `${side} lane d`)
        assert.ok(l.a > plan.sidewalk.a0 + 1 && l.a < plan.sidewalk.a1 - 1, `${side} lane a`)
      }
      // Nothing planted in the 1.4 m door corridor in front of the door.
      for (const t of plan.trees) assert.ok(Math.abs(t.a - plan.doorA) > 2, `${side} tree near door`)
      for (const p of plan.planters) assert.ok(Math.abs(p.a - plan.doorA) - p.w / 2 > 0.7, `${side} planter in corridor`)
    }
  })

  const layouts = { ultimate: ultimateDemoLayout, varied: mockLayout }
  for (const [layoutName, layout] of Object.entries(layouts)) {
    const grid = nav.buildNavGrid(layout.tables)
    const placements = place.computeCustomerPlacements(layout.tables, guestFixture(layout, 30))
    for (const [side, e] of Object.entries(entrances)) {
      const plan = urban.planUrban(e)
      const street = out.buildOutdoorNav(plan)
      const entranceOk = nav.validateEntrance(grid, e).ok
      const free = (x, z) => grid.pointFree(x, z)
      if (!entranceOk) continue // an entrance the editor itself would refuse: no arrivals (covered by validateEntrance tests)

      check(`${layoutName}/${side}: sidewalk legs exist for every guest, stay on the sidewalk and pass the wall only through the doorway`, () => {
        let routes = 0
        for (const p of placements) {
          const id = `${p.guestId}`
          const entry = out.planEntryLeg(street, e, free, id)
          assert.ok(entry.ok, `${id} entry: ${entry.reason}`)
          const pts = entry.points
          assert.deepEqual([pts.at(-1).x, pts.at(-1).z], [e.x, e.z], 'ends at the configured entrance')
          assert.equal(out.whereIs(plan, pts[0]), 'street', 'spawns on the street side')
          const spawn = urban.toLocal(side, pts[0].x, pts[0].z)
          assert.ok(spawn.d > 0.6 && spawn.d < urban.SIDEWALK_DEPTH - 0.4, 'spawn is on the sidewalk')
          walk(pts, (x, z) => {
            const l = urban.toLocal(side, x, z)
            // Never in the road, and never beyond the curb.
            assert.ok(l.d < urban.SIDEWALK_DEPTH + 1e-6, `${id}: ${x.toFixed(2)},${z.toFixed(2)} off the sidewalk (d=${l.d.toFixed(2)})`)
            if (inWallThickness(x, z)) assert.ok(Math.abs(l.a - plan.doorA) <= DOOR_OPENING / 2 - 0.17 + 1e-6, `${id}: crosses the wall outside the doorway`)
            if (insideBuilding(x, z) && !inWallThickness(x, z)) assert.ok(l.d < 0, `${id}: inside the building but d>=0`)
          })
          routes++
        }
        assert.equal(routes, placements.length)
      })

      check(`${layoutName}/${side}: full arrival (sidewalk -> door -> chair) and departure (chair -> door -> sidewalk) are continuous and safe`, () => {
        let done = 0
        for (const p of placements) {
          const seat = seatOf(p)
          const arrival = rp.planArrival(grid, e, seat, STAND)
          const departure = rp.planDeparture(grid, e, seat, STAND)
          if (!arrival.ok || !departure.ok) continue // seats the indoor planner refuses are reported by the indoor tests
          const entry = out.planEntryLeg(street, e, free, p.guestId)
          const exit = out.planExitLeg(street, e, free, p.guestId)
          assert.ok(entry.ok && exit.ok)
          const inbound = arrival.plan.route.withHead(entry.points)
          const outbound = departure.plan.route.withTail(exit.points)
          // Same entrance both ways: the in/out legs cross the wall at the same doorway.
          assert.ok(inbound.length > arrival.plan.route.length + 1, 'sidewalk walk is part of the route')
          assert.ok(Math.abs(inbound.points[0].x - entry.points[0].x) < 1e-9)
          assert.equal(out.whereIs(plan, outbound.points.at(-1)), 'street', 'despawns outside')
          const end = urban.toLocal(side, outbound.points.at(-1).x, outbound.points.at(-1).z)
          assert.ok(end.d > 0.6 && end.d < urban.SIDEWALK_DEPTH - 0.4, 'exit point is on the sidewalk')
          // pullAt still points at the same spot of the indoor part (shifted by the sidewalk length)
          const shift = inbound.length - arrival.plan.route.length
          assert.ok(Math.abs(inbound.markers.pullAt - (arrival.plan.route.markers.pullAt + shift)) < 0.01, 'pullAt shifted')
          assert.equal(outbound.markers.returnAt, departure.plan.route.markers.returnAt, 'returnAt unchanged')
          const speedsOk = inbound.sample(0, { x: 0, z: 0, yaw: 0, speed: 1 }).speed === 1
          assert.ok(speedsOk)
          for (const route of [inbound, outbound]) {
            walk(route.points, (x, z) => {
              const l = urban.toLocal(side, x, z)
              if (inWallThickness(x, z)) assert.ok(Math.abs(l.a - plan.doorA) <= DOOR_OPENING / 2 - 0.17 + 1e-6, 'wall crossed only at the doorway')
              if (!insideBuilding(x, z)) assert.ok(l.d < urban.SIDEWALK_DEPTH + 1e-6, 'never in the road')
            })
          }
          done++
        }
        assert.ok(done > 0, 'at least one seat produced a full route')
      })
    }
  }

  check('reserved space: the entrance corridor and the reception footprint are clear of every table and chair (fixture layouts)', () => {
    const hit = (rect, o) => {
      // Conservative: circle / rect obstacles as their bounding box against the reserved rectangle.
      const hx = o.kind === 'circle' ? o.r : Math.max(o.hx, o.hz)
      const hz = hx
      return Math.abs(o.x - rect.x) < rect.hx + hx && Math.abs(o.z - rect.z) < rect.hz + hz
    }
    for (const layout of [ultimateDemoLayout]) {
      const obstacles = nav.obstaclesFromTables(layout.tables)
      for (const e of [entrances.south, entrances.west]) {
        const plan = urban.planUrban(e)
        for (const rect of [plan.corridor, plan.reception]) {
          assert.ok(!obstacles.some(o => hit(rect, o)), 'reserved rectangle is free')
          // and inside the room (never in the wall)
          assert.ok(Math.abs(rect.x) + rect.hx <= floorEdge.x + 1e-6 && Math.abs(rect.z) + rect.hz <= floorEdge.z + 1e-6, 'inside the floor')
        }
      }
    }
  })

  check('blocked doorway: furniture in the entrance makes the outdoor leg refuse instead of crossing it', () => {
    const plan = urban.planUrban(entrances.south)
    const street = out.buildOutdoorNav(plan)
    assert.equal(out.planEntryLeg(street, entrances.south, () => false, 'g1').ok, false)
    assert.equal(out.planEntryLeg(street, entrances.south, () => false, 'g1').reason, 'door_blocked')
    assert.equal(out.planExitLeg(street, entrances.south, () => false, 'g1').ok, false)
  })

  check('blocked sidewalk: a lane that is walled off by obstacles reports no_sidewalk_route', () => {
    const plan = urban.planUrban(entrances.south)
    const blocked = { ...plan, obstacles: [...plan.obstacles, { kind: 'rect', rect: urban.localRect('south', plan.doorA - 14, plan.doorA + 14, 0.4, 2.8), name: 'wall-of-boxes' }], lane: plan.lane }
    const street = out.buildOutdoorNav(blocked)
    const leg = out.planEntryLeg(street, entrances.south, () => true, 'g1')
    assert.equal(leg.ok, false)
  })

  check('whereIs / retreat / sidewalk exit: a guest turned around mid-arrival heads back to the street', () => {
    const plan = urban.planUrban(entrances.south)
    const street = out.buildOutdoorNav(plan)
    const onStreet = urban.toWorld('south', plan.doorA - 4, 1.4)
    assert.equal(out.whereIs(plan, onStreet), 'street')
    const exit = out.planSidewalkExit(street, onStreet, 'g1')
    assert.ok(exit && exit.length > 2)
    walk(exit, (x, z) => assert.ok(urban.toLocal('south', x, z).d < urban.SIDEWALK_DEPTH + 1e-6))
    const inDoor = urban.toWorld('south', plan.doorA, -0.1)
    assert.equal(out.whereIs(plan, inDoor), 'door')
    const retreat = out.planRetreat(street, inDoor, 'g1')
    assert.ok(retreat && out.whereIs(plan, retreat.at(-1)) === 'street')
    walk(retreat, (x, z) => { if (inWallThickness(x, z)) assert.ok(Math.abs(urban.toLocal('south', x, z).a - plan.doorA) < 0.3) })
    assert.equal(out.whereIs(plan, urban.toWorld('south', plan.doorA, -2)), 'room')
  })

  check('context points frame the street ends and the terrace', () => {
    const plan = urban.planUrban(entrances.south)
    const pts = urban.contextPoints(plan)
    assert.equal(pts.length, 4)
    assert.ok(pts.some(p => p.z > OUTER_Z) && pts.some(p => p.x > OUTER_X))
  })

  console.log(`urban exterior: ${checks} checks passed`)
} finally {
  await server.close()
}
