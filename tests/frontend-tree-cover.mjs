// Phase 3.1K-D2B - urban plan (no neighbours, larger terrace/street) and tree-covered guest spawn / despawn.
// Pure, fixture based: real ray tests against the drawn tree shapes, real A* on the outdoor grid.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const urban = await server.ssrLoadModule('/src/components/restaurant-3d/urban-plan.ts')
  const cover = await server.ssrLoadModule('/src/components/restaurant-3d/tree-cover.ts')
  const out = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/outdoor-nav.ts')
  const nav = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/floor-nav.ts')
  const fr = await server.ssrLoadModule('/src/components/restaurant-3d/framing.ts')
  const { ultimateDemoLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/ultimate-demo.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')

  const entrances = { west: { x: -9.4, z: 3.1 }, east: { x: 9.4, z: -2.3 }, north: { x: 4.2, z: -7.4 }, south: { x: -5.5, z: 7.6 } }
  const eyeFor = (plan, entrance, w, h) => {
    const f = fr.frameRestaurant({ tables: ultimateDemoLayout.tables, entrance, includeFloor: true, context: urban.contextPoints(plan), wallHeight: 3, maxDistance: 70, width: w, height: h - 60, viewportWidth: w })
    return { x: f.position[0], y: f.position[1], z: f.position[2] }
  }
  const views = [['desktop', 1440, 900], ['phone', 390, 844]]
  const walk = (pts, fn) => {
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / 0.05))
      for (let k = 0; k <= n; k++) fn(pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / n, pts[i - 1].z + ((pts[i].z - pts[i - 1].z) * k) / n)
    }
  }

  // ---- plan -----------------------------------------------------------------------------------------------------------
  check('no neighbouring buildings: nothing in the plan or its obstacles', () => {
    for (const e of [...Object.values(entrances), null]) {
      const plan = urban.planUrban(e)
      assert.equal(plan.neighbours, undefined)
      assert.ok(!plan.obstacles.some(o => /neighbour/.test(o.name)))
    }
  })

  check('street dimensions grew: sidewalk 3.2 -> 4.4 m, road 7 -> 8.4 m, road and both pavements run the same length', () => {
    assert.equal(urban.SIDEWALK_DEPTH, 4.4)
    assert.equal(urban.ROAD_WIDTH, 8.4)
    const plan = urban.planUrban(entrances.south)
    assert.equal(plan.sidewalk.a0, plan.road.a0)
    assert.equal(plan.sidewalk.a1, plan.road.a1)
    assert.equal(plan.farSidewalk.a0, plan.road.a0)
    assert.ok(Math.abs(plan.road.d0 - (urban.SIDEWALK_DEPTH + urban.CURB_WIDTH)) < 1e-9, 'road starts at the curb')
    assert.ok(Math.abs(plan.farSidewalk.d0 - (plan.road.d1 + urban.CURB_WIDTH)) < 1e-9, 'far pavement starts at the far curb')
  })

  check('terrace: the deck covers the whole lateral wall and reaches 8 m out, on the wall that is not the street', () => {
    for (const e of Object.values(entrances)) {
      const plan = urban.planUrban(e)
      const f = urban.SIDE_FRAMES[plan.terrace.side]
      assert.notEqual(plan.terrace.side, plan.side)
      assert.equal(plan.terrace.deck.a0, -f.half)
      assert.equal(plan.terrace.deck.a1, f.half)
      assert.equal(plan.terrace.deck.depth, 8)
      assert.ok(plan.terrace.tables.length >= 12, `${plan.terrace.tables.length} tables`)
    }
  })

  check('terrace layout: no table, chair, plant or hedge overlaps another; the aisle in front of the door stays clear', () => {
    for (const e of [...Object.values(entrances), null]) {
      const plan = urban.planUrban(e)
      const t = plan.terrace
      const boxes = []
      for (const p of t.tables) {
        boxes.push({ n: 'table', a0: p.a - 0.4, a1: p.a + 0.4, d0: p.d - 0.4, d1: p.d + 0.4 })
        boxes.push({ n: 'chair', a0: p.a - 0.62 - 0.22, a1: p.a - 0.62 + 0.22, d0: p.d - 0.22, d1: p.d + 0.22 })
        boxes.push({ n: 'chair', a0: p.a + 0.62 - 0.22, a1: p.a + 0.62 + 0.22, d0: p.d - 0.22, d1: p.d + 0.22 })
      }
      for (const p of t.plants) boxes.push({ n: 'plant', a0: p.a - 0.3, a1: p.a + 0.3, d0: p.d - 0.3, d1: p.d + 0.3 })
      for (const h of t.hedges) boxes.push({ n: 'hedge', a0: h.a - h.w / 2, a1: h.a + h.w / 2, d0: h.d - h.depth / 2, d1: h.d + h.depth / 2 })
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]
        assert.ok(b.a0 >= t.deck.a0 - 1e-6 && b.a1 <= t.deck.a1 + 1e-6 && b.d0 >= -1e-6 && b.d1 <= t.deck.depth + 1e-6, `${b.n} inside the deck`)
        for (let j = i + 1; j < boxes.length; j++) {
          const c = boxes[j]
          assert.ok(b.a1 <= c.a0 + 1e-6 || c.a1 <= b.a0 + 1e-6 || b.d1 <= c.d0 + 1e-6 || c.d1 <= b.d0 + 1e-6, `${b.n} overlaps ${c.n}`)
        }
        // Door aisle (|a - door| < 1.45 m) from the wall to the outer edge: only the doorway's own plants flank it.
        if (b.n !== 'plant') assert.ok(b.a1 <= t.a - 1.45 + 1e-6 || b.a0 >= t.a + 1.45 - 1e-6 || (b.n === 'hedge' && b.d0 > t.deck.depth - 1), `${b.n} blocks the door aisle`)
      }
    }
  })

  check('trees: irregular spacing, never on the door line, never on a lamp, all on the sidewalk', () => {
    for (const e of Object.values(entrances)) {
      const plan = urban.planUrban(e)
      const gaps = plan.trees.slice(1).map((t, i) => t.a - plan.trees[i].a)
      assert.ok(Math.max(...gaps) - Math.min(...gaps) > 1.5, 'spacing varies')
      for (const t of plan.trees) {
        assert.ok(Math.abs(t.a - plan.doorA) >= 3.4, 'door line clear')
        assert.ok(t.d > 1.8 && t.d < urban.SIDEWALK_DEPTH - 0.6, 'on the sidewalk, off the curb')
        for (const l of plan.lamps) assert.ok(Math.abs(l.a - t.a) >= 1.9, 'lamp apart from a tree')
      }
      assert.ok(plan.lamps.length >= 8 && plan.farLamps.length >= 8, 'streetlights along both sides')
    }
  })

  // ---- occlusion maths ------------------------------------------------------------------------------------------------
  check('occlusion: a guest right behind a tree is fully hidden, one in front of it or far away is not', () => {
    const plan = urban.planUrban(entrances.south)
    const eye = eyeFor(plan, entrances.south, 1440, 900)
    const occ = cover.planOccluders(plan)
    const tree = plan.trees.find(t => Math.abs(urban.toWorld('south', t.a, t.d).x) < 20)
    const base = urban.toWorld('south', tree.a, tree.d)
    const dir = { x: base.x - eye.x, z: base.z - eye.z }
    const len = Math.hypot(dir.x, dir.z)
    const behind = { x: base.x + (dir.x / len) * 1.1, z: base.z + (dir.z / len) * 1.1 }
    const front = { x: base.x - (dir.x / len) * 1.1, z: base.z - (dir.z / len) * 1.1 }
    assert.equal(cover.hiddenFraction(eye, behind, occ), 1, 'behind')
    assert.ok(cover.hiddenFraction(eye, front, occ) < 0.5, 'in front')
    assert.equal(cover.hiddenFraction(eye, { x: base.x + 30, z: base.z }, occ), 0, 'far from any tree')
    assert.equal(cover.hiddenFraction(eye, behind, []), 0, 'no occluders, nothing hidden')
  })

  check('cover spots: for every entrance wall and both default views, trees give real, reachable, sidewalk-only cover', () => {
    for (const [vname, w, h] of views) for (const [side, e] of Object.entries(entrances)) {
      const plan = urban.planUrban(e)
      const eye = eyeFor(plan, e, w, h)
      const o = out.buildOutdoorNav(plan, eye)
      assert.ok(o.covers.length >= 3, `${vname}/${side}: ${o.covers.length} cover spots`)
      for (const c of o.covers) {
        assert.equal(cover.hiddenFraction(eye, c, o.occluders), 1, `${vname}/${side}: spot fully hidden`)
        const l = urban.toLocal(side, c.x, c.z)
        assert.ok(l.d > 0.6 && l.d < urban.SIDEWALK_DEPTH - 0.5, 'on the sidewalk')
        assert.ok(Math.abs(l.a - plan.doorA) >= 4.5, 'away from the door')
        assert.ok(o.grid.pointFree(c.x, c.z), 'free of tree footprints, planters and the road')
        const tree = plan.trees[c.tree]
        const base = urban.toWorld(side, tree.a, tree.d)
        assert.ok(Math.hypot(c.x - base.x, c.z - base.z) >= urban.TREE_NAV_RADIUS, 'not inside the trunk / bed')
      }
    }
  })

  // ---- arrivals and departures ------------------------------------------------------------------------------------------
  const indoor = nav.buildNavGrid(ultimateDemoLayout.tables)
  const free = (x, z) => indoor.pointFree(x, z)
  const cleanOf = (o, pts, label) => {
    walk(pts, (x, z) => {
      const l = urban.toLocal(o.plan.side, x, z)
      const insideWall = Math.abs(x) < urban.OUTER_X && Math.abs(z) < urban.OUTER_Z
      if (!insideWall) assert.ok(l.d < urban.SIDEWALK_DEPTH + 1e-6, `${label}: off the sidewalk (d ${l.d.toFixed(2)})`)
      for (const t of o.plan.trees) {
        const b = urban.toWorld(o.plan.side, t.a, t.d)
        assert.ok(Math.hypot(x - b.x, z - b.z) > urban.TREE_NAV_RADIUS - 0.02, `${label}: walks through a tree bed`)
      }
    })
  }

  check('arrival: every guest is born hidden behind a tree and reaches the entrance (all four walls, both views)', () => {
    for (const [vname, w, h] of views) for (const [side, e] of Object.entries(entrances)) {
      const plan = urban.planUrban(e)
      const eye = eyeFor(plan, e, w, h)
      const o = out.buildOutdoorNav(plan, eye)
      for (let i = 0; i < 12; i++) {
        const id = `guest-${i}`
        const leg = out.planEntryLeg(o, e, free, id)
        assert.ok(leg.ok, `${vname}/${side}/${id}: ${leg.reason}`)
        assert.ok(leg.hidden, `${vname}/${side}/${id}: spawn is not hidden`)
        assert.equal(cover.hiddenFraction(eye, leg.spawn, o.occluders), 1, 'spawn really hidden from the reference camera')
        assert.ok(Math.hypot(leg.points[0].x - leg.spawn.x, leg.points[0].z - leg.spawn.z) < 1e-9, 'the route starts at the hidden spot')
        assert.ok(Math.hypot(leg.points.at(-1).x - e.x, leg.points.at(-1).z - e.z) < 1e-6, 'ends on the entrance')
        cleanOf(o, leg.points, `${vname}/${side}/${id}`)
      }
    }
  })

  check('arrival: a guest walks out into the open (leaves cover) before reaching the door', () => {
    const plan = urban.planUrban(entrances.south)
    const eye = eyeFor(plan, entrances.south, 1440, 900)
    const o = out.buildOutdoorNav(plan, eye)
    const leg = out.planEntryLeg(o, entrances.south, free, 'walker')
    let exposedAt = null
    let travelled = 0
    for (let i = 1; i < leg.points.length && exposedAt === null; i++) {
      travelled += Math.hypot(leg.points[i].x - leg.points[i - 1].x, leg.points[i].z - leg.points[i - 1].z)
      if (cover.hiddenFraction(eye, leg.points[i], o.occluders) < 1) exposedAt = travelled
    }
    assert.ok(exposedAt !== null && exposedAt < 12, `first visible after ${exposedAt} m`)
  })

  check('departure: from the entrance to a hidden spot behind a tree, and only there (all four walls, both views)', () => {
    for (const [vname, w, h] of views) for (const [side, e] of Object.entries(entrances)) {
      const plan = urban.planUrban(e)
      const eye = eyeFor(plan, e, w, h)
      const o = out.buildOutdoorNav(plan, eye)
      for (let i = 0; i < 12; i++) {
        const id = `guest-${i}`
        const leg = out.planExitLeg(o, e, free, id)
        assert.ok(leg.ok, `${vname}/${side}/${id}: ${leg.reason}`)
        assert.ok(leg.hidden, `${vname}/${side}/${id}: exit is not hidden`)
        assert.equal(cover.hiddenFraction(eye, leg.exit, o.occluders), 1, 'despawn point really hidden')
        assert.ok(Math.hypot(leg.points[0].x - e.x, leg.points[0].z - e.z) < 1e-6, 'starts on the entrance')
        assert.ok(Math.hypot(leg.points.at(-1).x - leg.exit.x, leg.points.at(-1).z - leg.exit.z) < 1e-9, 'ends at the hidden spot')
        cleanOf(o, leg.points, `${vname}/${side}/${id}`)
        // Not hidden anywhere near the doorway: it must be walking in the open when it passes the door.
        assert.ok(cover.hiddenFraction(eye, plan.front, o.occluders) < 1, 'the door front is exposed')
      }
    }
  })

  check('spawn spots vary: different guests use different trees', () => {
    const plan = urban.planUrban(entrances.south)
    const o = out.buildOutdoorNav(plan, eyeFor(plan, entrances.south, 1440, 900))
    const used = new Set(Array.from({ length: 30 }, (_, i) => out.planEntryLeg(o, entrances.south, free, `g${i}`).spawn).map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`))
    assert.ok(used.size >= 3, `${used.size} different spots`)
    // ...and close to the door: a short walk along the sidewalk, never across the block.
    for (const k of used) { const [x, z] = k.split(',').map(Number); assert.ok(Math.hypot(x - plan.front.x, z - plan.front.z) <= 28, `spot ${k} is ${Math.hypot(x - plan.front.x, z - plan.front.z).toFixed(0)} m from the door`) }
  })

  check('fallback: no known camera -> no hidden spots, the lane is used and flagged for a soft fade (never a pop)', () => {
    const plan = urban.planUrban(entrances.south)
    const o = out.buildOutdoorNav(plan, null)
    assert.equal(o.covers.length, 0)
    const entry = out.planEntryLeg(o, entrances.south, free, 'g')
    const exit = out.planExitLeg(o, entrances.south, free, 'g')
    assert.ok(entry.ok && exit.ok)
    assert.equal(entry.hidden, false)
    assert.equal(exit.hidden, false)
  })

  check('live camera: a spot that does not hide the guest from where the person orbited to is flagged for the fade', () => {
    const plan = urban.planUrban(entrances.south)
    const o = out.buildOutdoorNav(plan, eyeFor(plan, entrances.south, 1440, 900))
    // From the opposite side, the same spots are exposed.
    const opposite = { x: -o.eye.x, y: o.eye.y, z: -o.eye.z + 24 }
    for (let i = 0; i < 20; i++) {
      const leg = out.planEntryLeg(o, entrances.south, free, `g${i}`, opposite)
      assert.ok(leg.ok)
      if (leg.hidden) assert.equal(cover.hiddenFraction(opposite, leg.spawn, o.occluders), 1, 'hidden claims must be true from the live camera')
    }
  })

  check('failure handling kept: blocked door and a walled-off sidewalk still refuse, no teleport through obstacles', () => {
    const plan = urban.planUrban(entrances.south)
    const o = out.buildOutdoorNav(plan, eyeFor(plan, entrances.south, 1440, 900))
    assert.equal(out.planEntryLeg(o, entrances.south, () => false, 'g').reason, 'door_blocked')
    assert.equal(out.planExitLeg(o, entrances.south, () => false, 'g').reason, 'door_blocked')
    const walled = { ...plan, obstacles: [...plan.obstacles, { kind: 'rect', rect: urban.localRect('south', plan.doorA - 40, plan.doorA + 40, 0.3, 3.4), name: 'wall-of-boxes' }] }
    const blocked = out.buildOutdoorNav(walled, o.eye)
    assert.equal(out.planEntryLeg(blocked, entrances.south, free, 'g').reason, 'no_sidewalk_route')
  })

  check('the varied layout fixture works too (no entrance override): spots found, legs valid', () => {
    const e = entrances.south
    const grid = nav.buildNavGrid(mockLayout.tables)
    const plan = urban.planUrban(e)
    const o = out.buildOutdoorNav(plan, eyeFor(plan, e, 1440, 900))
    const leg = out.planEntryLeg(o, e, (x, z) => grid.pointFree(x, z), 'varied')
    assert.ok(leg.ok && leg.hidden)
  })

  console.log(`tree cover: ${checks} checks passed`)
} finally {
  await server.close()
}
