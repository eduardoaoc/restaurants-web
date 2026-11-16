// Phase 3.1K-E1 - static architectural cutaway: back (north) + left (west) walls full height, front (south) + right (east)
// walls low, independent of the camera and of the entrance; real openings; walls stay physical boundaries for navigation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const urban = await server.ssrLoadModule('/src/components/restaurant-3d/urban-plan.ts')
  const out = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/outdoor-nav.ts')
  const lim = await server.ssrLoadModule('/src/components/restaurant-3d/camera-limits.ts')
  const fr = await server.ssrLoadModule('/src/components/restaurant-3d/framing.ts')
  const { ultimateDemoLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/ultimate-demo.ts')
  const entrances = { west: { x: -9.4, z: 3.1 }, east: { x: 9.4, z: -2.3 }, north: { x: 4.2, z: -7.4 }, south: { x: -5.5, z: 7.6 } }
  const all = [...Object.values(entrances), null, { x: -9.9, z: 7.9 }]

  check('mapping is fixed: north + west full, south + east low, whatever the entrance', () => {
    assert.deepEqual([...urban.FULL_WALL_SIDES].sort(), ['north', 'west'])
    assert.deepEqual([...urban.LOW_WALL_SIDES].sort(), ['east', 'south'])
    for (const e of all) for (const p of urban.planWallPieces(e)) assert.equal(p.low, p.side === 'south' || p.side === 'east', `${p.side} piece`)
    assert.equal(urban.LOW_WALL_HEIGHT, 0.4)
  })

  check('full walls keep every module (windows, door modules); low walls carry no window and no door module', () => {
    for (const e of all) {
      const pieces = urban.planWallPieces(e)
      const full = pieces.filter(p => !p.low)
      assert.deepEqual(full.map(p => ({ ...p, low: undefined })), urban.planWallModules(e).filter(m => m.side === 'north' || m.side === 'west').map(m => ({ ...m, low: undefined })))
      assert.ok(pieces.filter(p => p.low).every(p => !p.window && p.kind === 'wall'), 'low: plain wall pieces only')
    }
  })

  check('low walls: pieces tile each run exactly, leaving a real 0.9 m opening centred on each door (entrance or terrace)', () => {
    for (const e of all) {
      const doors = urban.planDoors(e)
      for (const side of urban.LOW_WALL_SIDES) {
        const half = urban.runHalf(side)
        const spans = urban.planWallPieces(e).filter(p => p.side === side).map(p => [p.along - (p.stretch * urban.WALL_MODULE) / 2, p.along + (p.stretch * urban.WALL_MODULE) / 2]).sort((a, b) => a[0] - b[0])
        const gaps = []
        let cursor = -half
        for (const [a, b] of spans) { if (a - cursor > 1e-6) gaps.push([cursor, a]); assert.ok(a >= cursor - 1e-6, `${side}: overlap`); cursor = b }
        if (half - cursor > 1e-6) gaps.push([cursor, half])
        const wanted = doors.filter(d => d.side === side)
        assert.equal(gaps.length, wanted.length, `${side}: ${gaps.length} openings for ${wanted.length} doors`)
        for (const g of gaps) {
          const d = wanted.find(w => Math.abs((g[0] + g[1]) / 2 - w.along) < 1e-6)
          assert.ok(d, `${side}: opening not centred on a door`)
          assert.ok(Math.abs(g[1] - g[0] - urban.DOOR_OPENING) < 1e-6, `${side}: opening width ${g[1] - g[0]}`)
        }
      }
    }
  })

  check('entrance doorway is intact on every wall (full: door module; low: opening on the configured entrance)', () => {
    for (const [side, e] of Object.entries(entrances)) {
      const along = side === 'west' || side === 'east' ? e.z : e.x
      const entranceDoor = urban.planDoors(e).find(d => d.entrance)
      assert.equal(entranceDoor.side, side)
      assert.ok(Math.abs(entranceDoor.along - along) < 1e-9)
      const here = urban.planWallPieces(e).filter(p => p.side === side)
      if (urban.isLowWall(side)) assert.ok(!here.some(p => Math.abs(p.along - along) < 0.45 + 1e-6 && Math.abs(p.stretch) > 0), 'no wall in the opening')
      else assert.ok(here.some(p => p.kind === 'door' && p.entrance && Math.abs(p.along - along) < 1e-9), 'door module on the full wall')
    }
  })

  check('no camera-dependent wall logic in the Ultimate environment (no cutaway module, no per-frame hook)', () => {
    const src = readFileSync('src/components/restaurant-3d/UltimateEnvironment.vue', 'utf8')
    for (const banned of ['wall-cutaway', 'cutawayTarget', 'easeCutaway', 'onBeforeRender', 'useLoop', 'useTres', 'targetScale']) assert.ok(!src.includes(banned), `still references ${banned}`)
  })

  check('walls remain physical boundaries: the outdoor grid blocks the whole building outline except the door (low walls included)', () => {
    for (const [name, e] of Object.entries(entrances)) {
      const plan = urban.planUrban(e)
      const o = out.buildOutdoorNav(plan, null)
      for (const side of ['north', 'south', 'east', 'west']) {
        const f = urban.SIDE_FRAMES[side]
        for (let a = -f.half + 1; a <= f.half - 1; a += 0.5) {
          const p = urban.toWorld(side, a, -urban.WALL_T / 2)
          assert.equal(o.grid.pointFree(p.x, p.z), false, `${name}/${side}: wall line at a=${a} is walkable`)
        }
      }
    }
  })

  check('camera azimuth is limited to the open side of the cutaway; every default view is inside it', () => {
    const l = lim.cameraLimits(40)
    assert.ok(l.minAzimuth < 0 && l.maxAzimuth > Math.PI / 2 && l.maxAzimuth < Math.PI * 0.75)
    for (const w of [1440, 1280, 390, 375, 844]) {
      const d = fr.viewDirection(w)
      const az = Math.atan2(d[0], d[2])
      assert.ok(az > l.minAzimuth && az < l.maxAzimuth, `default azimuth ${(az * 180 / Math.PI).toFixed(0)} deg at ${w}`)
    }
    // From inside that range the camera is never on the far side of a full-height wall relative to the room centre.
    for (let az = l.minAzimuth; az <= l.maxAzimuth; az += 0.05) assert.ok(Math.cos(az) > -0.2, 'never behind the north wall')
  })

  // ---- E2: dedicated low walls, corner piers, phone framing -----------------------------------------------------------
  check('low walls are continuous runs; the gaps between runs are exactly the 0.9 m openings; runs stop at the corner piers', () => {
    for (const e of all) {
      const runs = urban.lowWallRuns(e)
      const doors = urban.planDoors(e)
      for (const side of urban.LOW_WALL_SIDES) {
        const mine = runs.filter(r => r.side === side).sort((a, b) => a.from - b.from)
        const half = urban.runHalf(side)
        assert.ok(Math.abs(mine[0].from + half) < 1e-6 || doors.some(d => d.side === side && Math.abs(d.along - urban.DOOR_OPENING / 2 + half) < 5), 'starts at the run end')
        assert.ok(Math.abs(mine[0].from + half) < 1e-6 && Math.abs(mine.at(-1).to - half) < 1e-6, `${side}: spans the whole run`)
        const wanted = doors.filter(d => d.side === side).length
        assert.equal(mine.length, wanted + 1, `${side}: ${wanted} openings -> ${wanted + 1} runs`)
        for (let i = 1; i < mine.length; i++) assert.ok(Math.abs(mine[i].from - mine[i - 1].to - urban.DOOR_OPENING) < 1e-6, `${side}: opening ${mine[i].from - mine[i - 1].to}`)
      }
      for (const r of runs) assert.ok(!urban.FULL_WALL_SIDES.includes(r.side))
    }
  })

  check('corner piers: three full-height (NW, NE, SW), one low (SE), each exactly filling the 0.45 m square between the wall ends and the outer corner', () => {
    const piers = urban.wallPiers()
    assert.equal(piers.length, 4)
    assert.equal(piers.filter(p => p.low).length, 1)
    for (const p of piers) {
      assert.equal(p.low, p.x > 0 && p.z > 0, 'only the south-east pier is low')
      assert.equal(p.height, p.low ? urban.LOW_WALL_HEIGHT : urban.WALL_HEIGHT)
      assert.ok(Math.abs(Math.abs(p.x) + p.w / 2 - urban.OUTER_X) < 1e-9 && Math.abs(Math.abs(p.z) + p.d / 2 - urban.OUTER_Z) < 1e-9, 'flush with the outer corner')
      assert.ok(Math.abs(Math.abs(p.x) - p.w / 2 - urban.runHalf('south')) < 1e-9 && Math.abs(Math.abs(p.z) - p.d / 2 - urban.runHalf('east')) < 1e-9, 'touches the wall runs, no gap')
    }
  })

  check('phone framing: the room and the terrace fit a portrait canvas at a readable scale, inside the camera azimuth limits', () => {
    const plan = urban.planUrban(entrances.south)
    const l = lim.cameraLimits(40)
    for (const [w, h] of [[390, 654], [375, 477]]) {
      const dir = fr.ultimateDirection(w)
      const az = Math.atan2(dir[0], dir[2])
      assert.ok(az > l.minAzimuth && az < l.maxAzimuth, 'inside azimuth limits')
      const f = fr.frameRestaurant({ tables: ultimateDemoLayout.tables, entrance: entrances.south, includeFloor: true, context: urban.terraceContextPoints(plan), wallHeight: 3, maxDistance: 90, direction: dir, width: w, height: h, viewportWidth: w })
      const pxPerM = h / (2 * Math.tan((fr.CAMERA_FOV * Math.PI) / 360) * f.distance)
      assert.ok(f.distance < 62 && f.distance < 70, `${w}: distance ${f.distance.toFixed(1)}`)
      assert.ok(pxPerM >= 14, `${w}: ${pxPerM.toFixed(1)} px/m`)
      assert.ok(f.distance <= lim.cameraLimits(70).maxDistance, 'within the zoom range')
    }
    assert.deepEqual(fr.ultimateDirection(1440), fr.ULTIMATE_ISO, 'desktop framing unchanged')
    assert.deepEqual(fr.ultimateDirection(1280), fr.ULTIMATE_ISO)
  })

  check('Ultimate source builds the perimeter from dedicated geometry: no squashed wall modules, no corner models', () => {
    const src = readFileSync('src/components/restaurant-3d/UltimateEnvironment.vue', 'utf8')
    assert.ok(!src.includes('LOW_SCALE') && !src.includes('house-wall-corner') && !/scale\.y\s*=/.test(src))
    assert.ok(src.includes('lowWallRuns') && src.includes('wallPiers'))
  })

  console.log(`static cutaway: ${checks} checks passed`)
} finally {
  await server.close()
}
