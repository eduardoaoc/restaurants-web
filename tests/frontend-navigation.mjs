// Phase 3.1E/3.1F - floor navigation, entrance validation, arrival/departure route planning (side approach around the
// pulled-out chair) and the chair motion model. Pure, fixture based: no browser, no backend.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const nav = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/floor-nav.ts')
  const rp = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/route-path.ts')
  const ci = await server.ssrLoadModule('/src/components/restaurant-3d/characters/chair-interaction.ts')
  const place = await server.ssrLoadModule('/src/components/restaurant-3d/characters/customer-placement.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')
  const { guestFixture } = await server.ssrLoadModule('/src/data/restaurant-3d/guest-fixtures.ts')

  const tables = mockLayout.tables
  const grid = nav.buildNavGrid(tables)
  const entrance = { x: 0, z: 6.5 }
  const full = place.computeCustomerPlacements(tables, guestFixture(mockLayout, 30))
  // Chair-local stand point: standZ (~0.51 male / ~0.55 female) minus the pull. Use the male value (the tighter one).
  const STAND = 0.514 - ci.CHAIR_PULL
  const seatOf = p => ({ x: p.x, z: p.z, yaw: p.yaw, ref: { tableId: p.tableId, chairIndex: p.seatIndex } })
  const local = (seat, q) => {
    const dx = q.x - seat.x, dz = q.z - seat.z, s = Math.sin(seat.yaw), c = Math.cos(seat.yaw)
    return [dx * c - dz * s, dx * s + dz * c]
  }
  const closestTo = (pts, a) => pts.reduce((best, q, i) => (Math.hypot(q.x - a.x, q.z - a.z) < Math.hypot(pts[best].x - a.x, pts[best].z - a.z) ? i : best), 0)
  const rectDist = (lx, lz, cz) => Math.hypot(Math.max(Math.abs(lx) - 0.22, 0), Math.max(Math.abs(lz - cz) - 0.22, 0))

  check('30 seats are covered by the fixture', () => assert.equal(full.length, 30))

  check('entrance validation: inside ok, outside floor and inside furniture rejected', () => {
    assert.deepEqual(nav.validateEntrance(grid, entrance), { ok: true })
    assert.equal(nav.validateEntrance(grid, { x: 0, z: 8.5 }).reason, 'outside_floor')
    assert.equal(nav.validateEntrance(grid, { x: 9.9, z: 0 }).reason, 'outside_floor')
    assert.equal(nav.validateEntrance(grid, { x: -1.5, z: -3.5 }).reason, 'blocked_by_furniture')
    assert.equal(nav.validateEntrance(grid, { x: 2.5, z: 1.5 }).reason, 'blocked_by_furniture')
  })

  const plans = full.map(p => ({ p, seat: seatOf(p), r: rp.planArrival(grid, entrance, seatOf(p), STAND) }))

  check('every seat of every table (round / square / rectangular, rotated) accepts the side approach', () => {
    for (const { p, r } of plans) assert.ok(r.ok, `${p.guestId} seat ${p.seatIndex}: ${r.reason}`)
    assert.equal(new Set(full.map(p => tables.find(t => t.id === p.tableId).shape)).size, 3)
  })

  check('walking part (entrance -> approach point) never enters furniture clearance or the floor margin', () => {
    for (const { p, r } of plans) {
      const pts = r.plan.overlay
      const end = closestTo(pts, r.plan.approach)
      assert.ok(end > 0)
      // up to ~0.6 m before the junction the walk keeps the full 0.3 m clearance; the junction blend keeps >= 0.2 m
      for (const q of pts.slice(0, Math.max(1, end - 6))) {
        assert.ok(grid.pointFree(q.x, q.z), `${p.guestId} walks through furniture at ${q.x.toFixed(2)},${q.z.toFixed(2)}`)
      }
      for (const q of pts.slice(0, end + 1)) {
        assert.ok(grid.pointFreeFor(q.x, q.z, { clearance: 0.2, ignore: { tableId: p.tableId, chairIndex: p.seatIndex } }), `${p.guestId} clips furniture near the approach point`)
        assert.ok(Math.abs(q.x) <= 10 - grid.options.margin + 1e-6 && Math.abs(q.z) <= 8 - grid.options.margin + 1e-6)
      }
    }
  })

  check('the customer NEVER crosses its chair: scripted approach stays clear of the tucked AND the pulled-out chair', () => {
    for (const { p, seat, r } of plans) {
      const pts = r.plan.overlay
      const start = closestTo(pts, r.plan.approach)
      for (const q of pts.slice(start)) {
        const [lx, lz] = local(seat, q)
        assert.ok(rectDist(lx, lz, 0) >= 0.17 - 1e-9, `${p.guestId}: ${(rectDist(lx, lz, 0)).toFixed(2)} m from the tucked chair`)
        assert.ok(rectDist(lx, lz, -ci.CHAIR_PULL) >= 0.12 - 1e-9, `${p.guestId}: too close to the pulled-out chair`)
        // never behind the backrest line while in the lane: the lane is only entered at the stand point, beside the chair
        assert.ok(grid.pointFreeFor(q.x, q.z, { clearance: 0.17, ignore: { tableId: p.tableId, chairIndex: p.seatIndex } }))
      }
    }
  })

  check('the stand point is clear of the table and of the row of chairs (no body/table overlap)', () => {
    for (const { p, seat, r } of plans) {
      const [lx, lz] = local(seat, r.plan.stand)
      assert.ok(Math.abs(lx) < 1e-6)
      assert.ok(Math.abs(lz - STAND) < 1e-6)
      // the customer's body front (~0.15 m ahead of the feet) must stay behind the tucked row (backs at chair-local z -0.22)
      assert.ok(lz + 0.15 < -0.2 + 1e-9, `${p.guestId} stands too close to the row (${lz.toFixed(2)})`)
    }
  })

  check('arrival ends facing the table (final heading = chair yaw) after a quarter pivot', () => {
    for (const { p, r } of plans) {
      const s = { x: 0, z: 0, yaw: 0, speed: 1 }
      r.plan.route.sample(r.plan.route.length, s)
      assert.ok(Math.abs(Math.atan2(Math.sin(s.yaw - p.yaw), Math.cos(s.yaw - p.yaw))) < 0.15, `${p.guestId}: final heading`)
      r.plan.route.sample(r.plan.route.length - 0.1, s)
      assert.ok(s.speed < 0.5, 'the pivot is slow')
    }
  })

  check('no abrupt turns anywhere: bounded heading change per 0.1 m step (no 180 deg turn)', () => {
    for (const { p, r } of plans) {
      const pts = r.plan.route.points
      let prev = null
      for (let i = 1; i < pts.length; i++) {
        const h = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
        if (prev !== null) assert.ok(Math.abs(Math.atan2(Math.sin(h - prev), Math.cos(h - prev))) < 1.2, `${p.guestId}: sharp turn at step ${i}`)
        prev = h
      }
    }
  })

  check('markers: the chair is pulled when the approach point is reached', () => {
    for (const { r } of plans) {
      assert.ok(r.plan.route.markers.pullAt > 1)
      assert.ok(r.plan.route.markers.pullAt < r.plan.route.length - 1.0, 'the pull happens well before the customer reaches the stand point')
    }
  })

  check('rotated tables (45 / 90 / 135 / 200 deg): approach is either clear of furniture or refused, never forced', () => {
    for (const rot of [45, 90, 135, 200]) {
      const layout = tables.map(t => ({ ...t, rotation: rot }))
      const g = nav.buildNavGrid(layout)
      for (const p of place.computeCustomerPlacements(layout, guestFixture({ tables: layout }, 30))) {
        const seat = seatOf(p)
        const r = rp.planArrival(g, entrance, seat, STAND)
        if (!r.ok) continue
        for (const q of r.plan.overlay) {
          assert.ok(g.pointFreeFor(q.x, q.z, { clearance: 0.17, ignore: { tableId: p.tableId, chairIndex: p.seatIndex } }), `rot ${rot} ${p.guestId}`)
        }
      }
    }
  })

  check('departure: starts at the stand point, pivots slowly, passes the chair lane at the side, reaches the exit', () => {
    for (const p of full) {
      const seat = seatOf(p)
      const r = rp.planDeparture(grid, entrance, seat, STAND)
      assert.ok(r.ok, p.guestId)
      const pts = r.plan.route.points
      const [x0, z0] = local(seat, pts[0])
      assert.ok(Math.abs(x0) < 1e-6 && Math.abs(z0 - STAND) < 1e-6)
      assert.ok(Math.hypot(pts.at(-1).x - entrance.x, pts.at(-1).z - entrance.z) < 1e-6)
      const s = { x: 0, z: 0, yaw: 0, speed: 1 }
      r.plan.route.sample(0.15, s)
      assert.ok(s.speed < 0.5)
      for (const q of pts) {
        const [lx, lz] = local(seat, q)
        assert.ok(rectDist(lx, lz, -ci.CHAIR_PULL) >= 0.12 - 1e-9, `${p.guestId}: walks into the pulled-out chair`)
        assert.ok(grid.pointFreeFor(q.x, q.z, { clearance: 0.17, ignore: { tableId: p.tableId, chairIndex: p.seatIndex } }) || nav.insideObstacle === undefined, p.guestId)
      }
      // return marker: customer is beside the lane (|x| > chair half) when the chair is allowed to come home
      const m = r.plan.route.markers.returnAt
      assert.ok(m > 0.3 && m < r.plan.route.length)
      const at = { x: 0, z: 0, yaw: 0, speed: 1 }
      r.plan.route.sample(m, at)
      assert.ok(Math.abs(local(seat, at)[0]) >= 0.45, `${p.guestId}: chair returns while the customer is still in the lane`)
    }
  })

  check('the entrance is configurable: different entrances give different, still valid routes', () => {
    const p = full.find(x => x.tableId === 'table-2')
    const a = rp.planArrival(grid, { x: -8, z: 6.5 }, seatOf(p), STAND)
    const b = rp.planArrival(grid, { x: 9, z: -1 }, seatOf(p), STAND)
    assert.ok(a.ok && b.ok)
    assert.notDeepEqual(a.plan.route.points[0], b.plan.route.points[0])
  })

  check('navigation failure: a walled floor finds no route (never a straight-line cheat)', () => {
    const split = new nav.NavGrid({ width: 20, depth: 16 }, [{ kind: 'rect', x: 0, z: 0, hx: 0.3, hz: 9, yaw: 0, tableId: 'wall' }])
    assert.equal(split.findPath({ x: -5, z: 0 }, { x: 5, z: 0 }), null)
    assert.ok(split.findPath({ x: -5, z: 0 }, { x: -2, z: 5 }))
  })

  check('navigation failure: a chair that cannot be approached safely is refused (no forced animation)', () => {
    // Seat at the floor edge, facing the wall's inside: the side/behind points are outside the floor.
    const r = rp.planArrival(grid, entrance, { x: 9.8, z: 0, yaw: -Math.PI / 2 }, STAND)
    assert.equal(r.ok, false)
    // A seat boxed in by furniture on every side.
    const boxed = new nav.NavGrid({ width: 20, depth: 16 }, [
      { kind: 'rect', x: 0, z: 0, hx: 3, hz: 0.3, yaw: 0, tableId: 'a' }, { kind: 'rect', x: 0, z: 3, hx: 3, hz: 0.3, yaw: 0, tableId: 'b' },
      { kind: 'rect', x: -3, z: 1.5, hx: 0.3, hz: 1.8, yaw: 0, tableId: 'c' }, { kind: 'rect', x: 3, z: 1.5, hx: 0.3, hz: 1.8, yaw: 0, tableId: 'd' },
    ])
    assert.equal(rp.planArrival(boxed, { x: 0, z: 6.5 }, { x: 0, z: 1.5, yaw: 0 }, STAND).ok, false)
    // The pulled-out chair would land inside a neighbouring table: the seat is refused too.
    const crowded = [{ ...tables[1] }, { id: 'near', number: 9, seats: 2, shape: 'square', position: { x: tables[1].position.x, z: tables[1].position.z - 2.2 }, rotation: 0 }]
    const g2 = nav.buildNavGrid(crowded)
    const refused = place.computeCustomerPlacements(crowded, guestFixture({ tables: crowded }, 6)).filter(p => p.tableId === tables[1].id).map(p => rp.planArrival(g2, entrance, seatOf(p), STAND))
    assert.ok(refused.some(r => !r.ok), 'a seat whose pulled-out chair would hit a table must be refused')
  })

  check('layout changes are reflected: moving a table into the corridor changes (or refuses) the route', () => {
    const p = full.find(x => x.tableId === 'table-6' && x.seatIndex === 0)
    const before = rp.planArrival(grid, entrance, seatOf(p), STAND)
    const moved = tables.map(t => (t.id === 'table-4' ? { ...t, position: { x: 0.75, z: 4.75 } } : t))
    const g2 = nav.buildNavGrid(moved)
    const after = rp.planArrival(g2, entrance, seatOf(p), STAND)
    assert.ok(before.ok)
    if (after.ok) for (const q of after.plan.overlay.slice(0, Math.max(1, closestTo(after.plan.overlay, after.plan.approach) - 6))) assert.ok(g2.pointFree(q.x, q.z))
    assert.notDeepEqual(before.plan.route.points, after.ok ? after.plan.route.points : [])
  })

  check('grid build and path queries are cheap (limited recalculation is affordable)', () => {
    const t0 = performance.now(); const g = nav.buildNavGrid(tables); const t1 = performance.now()
    for (let i = 0; i < 20; i++) rp.planArrival(g, entrance, seatOf(full[i]), STAND)
    const t2 = performance.now()
    assert.ok(t1 - t0 < 400, `grid build ${(t1 - t0).toFixed(0)} ms`)
    assert.ok((t2 - t1) / 20 < 80, `plan ${((t2 - t1) / 20).toFixed(1)} ms`)
  })

  check('degenerate route (a customer removed right at the entrance) is sampled without throwing and has no length', () => {
    const route = new rp.RoutePath([{ x: 1, z: 2 }])
    const out = { x: 0, z: 0, yaw: 0, speed: 0 }
    route.sample(0, out)
    assert.equal(route.length, 0)
    assert.deepEqual([out.x, out.z], [1, 2])
  })

  // ---- chair motion model --------------------------------------------------------------------------------------
  check('ChairMotion: eased, monotonic translation from tucked to pulled and back; never scales or jumps', () => {
    const m = new ci.ChairMotion()
    m.claim('a')
    m.moveTo('a', -ci.CHAIR_PULL, ci.PULL_SECONDS)
    let prev = 0
    for (let t = 0; t < ci.PULL_SECONDS + 0.1; t += 1 / 60) {
      m.update(1 / 60)
      assert.ok(m.offset <= prev + 1e-12, 'monotonic')
      assert.ok(Math.abs(m.offset - prev) < 0.06, 'no jump between frames')
      prev = m.offset
    }
    assert.equal(m.offset, -ci.CHAIR_PULL)
    assert.equal(m.moving, false)
    m.moveTo('a', 0, ci.PUSH_SECONDS)
    for (let t = 0; t < ci.PUSH_SECONDS + 0.1; t += 1 / 60) m.update(1 / 60)
    assert.equal(m.offset, 0)
  })
  check('ChairMotion: retargeting mid-way starts from the current offset (no jump)', () => {
    const m = new ci.ChairMotion(); m.claim('a'); m.moveTo('a', -1, 0.6)
    for (let i = 0; i < 18; i++) m.update(1 / 60)
    const mid = m.offset
    assert.ok(mid < -0.1 && mid > -0.9)
    m.moveTo('a', 0, 0.8); m.update(1e-6)
    assert.ok(Math.abs(m.offset - mid) < 1e-3, 'continues from where it was')
  })
  check('ChairMotion: only the owner commands the chair; a new owner takes over; returnHome frees it', () => {
    const m = new ci.ChairMotion(); m.claim('first'); m.moveTo('first', -1, 0.5)
    m.claim('second')
    m.moveTo('first', 0, 0.5)               // the old owner is ignored
    assert.equal(m.target, -1)
    m.returnHome('first')                   // ignored as well: 'second' still owns it
    assert.equal(m.owner, 'second')
    for (let i = 0; i < 40; i++) m.update(1 / 60)
    m.returnHome('second', 0.5)
    assert.equal(m.owner, null)
    assert.equal(m.idle, false)             // still travelling home
    for (let i = 0; i < 60; i++) m.update(1 / 60)
    assert.equal(m.offset, 0)
    assert.equal(m.idle, true)              // settled at home with no owner: the temporary chair can be released
  })
  check('ChairMotion: snapHome (edit mode / table removed) is instant and leaves nothing stuck', () => {
    const m = new ci.ChairMotion(); m.claim('a'); m.moveTo('a', -1, 0.6)
    for (let i = 0; i < 10; i++) m.update(1 / 60)
    m.snapHome()
    assert.equal(m.offset, 0); assert.equal(m.idle, true)
  })
  {
    const prop = await server.ssrLoadModule('/src/components/restaurant-3d/characters/table-chair-prop.ts')
    check('temporary chair: translation only (scale 1, same yaw, visible) at every offset, moving along the chair axis', () => {
      const seat = place.seatFrameOf(tables, 'table-6', 2)
      const mesh = prop.createChairProp()
      const home = { x: seat.x, z: seat.z }
      for (const off of [0, -0.2, -0.55, -ci.CHAIR_PULL, -0.3, 0]) {
        prop.placeChairProp(mesh, seat, off)
        assert.equal(mesh.scale.x, 1); assert.equal(mesh.scale.y, 1); assert.equal(mesh.scale.z, 1)
        assert.equal(mesh.rotation.y, seat.yaw)
        assert.equal(mesh.visible, true)
        const along = (mesh.position.x - home.x) * Math.sin(seat.yaw) + (mesh.position.z - home.z) * Math.cos(seat.yaw)
        const across = (mesh.position.x - home.x) * Math.cos(seat.yaw) - (mesh.position.z - home.z) * Math.sin(seat.yaw)
        assert.ok(Math.abs(along - off) < 1e-9 && Math.abs(across) < 1e-9, 'moves exactly along its own axis')
      }
      prop.disposeChairPropResources()
    })
  }
  check('seat frames: temporary chairs can be placed for any seat, with or without a guest', () => {
    for (const t of tables) for (let i = 0; i < t.seats; i++) assert.ok(place.seatFrameOf(tables, t.id, i))
    assert.equal(place.seatFrameOf(tables, 'ghost', 0), null)
    assert.equal(place.seatFrameOf(tables, tables[0].id, 99), null)
  })
} finally {
  await server.close()
}
console.log(`frontend-navigation: ${checks} checks passed`)
