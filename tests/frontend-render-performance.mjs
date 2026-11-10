import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

/**
 * Phase 3.1I. RUNTIME: instanced chairs (real Three.js objects, no GPU needed) and the quality tiers.
 * SOURCE-PATTERN: Vue wiring. Frame rates are NOT asserted here: they need a GPU and are measured in the browser.
 */
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const read = (p) => readFileSync(p, 'utf8')
try {
  const { ChairInstances } = await server.ssrLoadModule('/src/components/restaurant-3d/chair-instances.ts')
  const { chooseQuality } = await server.ssrLoadModule('/src/components/restaurant-3d/graphics-quality.ts')
  const { getChairPlacements } = await server.ssrLoadModule('/src/components/restaurant-3d/table-geometry.ts')
  const { chairWorldTransform } = await server.ssrLoadModule('/src/components/restaurant-3d/characters/customer-placement.ts')
  const { Vector3, Matrix4 } = await import('three')

  const T = (id, x, z, seats = 4, shape = 'round', rotation = 0) => ({ id, number: 1, seats, shape, position: { x, z }, rotation })

  // ---- RUNTIME: instancing ------------------------------------------------------------------------------------
  const chairs = new ChairInstances()
  const tables = [T('a', -3, 0, 4), T('b', 3, 1, 6, 'rectangular', 90), T('c', 0, 5, 2, 'square')]
  const total = chairs.update(tables)
  assert.equal(total, 12, '4 + 6 + 2 chairs')
  assert.equal(chairs.instancedMeshes.length, 3, 'seat, back and leg: three draw calls for every chair on the floor')
  assert.ok(chairs.instancedMeshes.every((m) => m.count === 12))
  assert.ok(chairs.instancedMeshes.every((m) => m.frustumCulled === false), 'moving instances are never culled by a stale bounding sphere')

  // The seat of chair 0 of table a sits exactly where the per-table groups used to put it (world transform of its placement).
  const placement = getChairPlacements(tables[0])[0]
  const world = chairWorldTransform(tables[0], placement)
  const m = new Matrix4()
  chairs.instancedMeshes[0].getMatrixAt(0, m)
  const at = new Vector3().setFromMatrixPosition(m)
  assert.ok(Math.abs(at.x - world.x) < 1e-6 && Math.abs(at.z - world.z) < 1e-6 && Math.abs(at.y - (0.45 - 0.025)) < 1e-6, 'seat instance matches the chair placement')

  // Hidden chairs (drawn by an animated prop) collapse to nothing, the others stay.
  chairs.update(tables, { a: [1] })
  chairs.instancedMeshes[0].getMatrixAt(1, m)
  assert.equal(new Vector3().setFromMatrixPosition(m).length(), 0, 'hidden chair is scaled to zero')
  assert.ok(Math.abs(m.determinant()) < 1e-12)
  chairs.instancedMeshes[0].getMatrixAt(0, m)
  assert.ok(Math.abs(m.determinant()) > 1e-6, 'visible chairs keep a real transform')

  // Moving / turning a table moves its chairs.
  const before = new Vector3()
  chairs.instancedMeshes[0].getMatrixAt(0, m); before.setFromMatrixPosition(m)
  chairs.update([T('a', -2, 1, 4), tables[1], tables[2]])
  chairs.instancedMeshes[0].getMatrixAt(0, m)
  const after = new Vector3().setFromMatrixPosition(m)
  assert.ok(Math.abs(after.x - before.x - 1) < 1e-6 && Math.abs(after.z - before.z - 1) < 1e-6, 'chair follows its table')

  // Removing a table removes its chairs; capacity grows when needed.
  assert.equal(chairs.update([tables[0]]), 4)
  const many = Array.from({ length: 30 }, (_, i) => T(`t${i}`, (i % 10) - 5, Math.floor(i / 10), 8, 'rectangular'))
  assert.equal(chairs.update(many), 240, 'more chairs than the initial capacity')
  assert.ok(chairs.instancedMeshes.every((mesh) => mesh.count === 240 && mesh.instanceMatrix.count >= 240))
  chairs.dispose()
  assert.equal(chairs.instancedMeshes.length, 0, 'dispose releases the meshes')

  // ---- RUNTIME: quality tiers ---------------------------------------------------------------------------------
  assert.deepEqual(chooseQuality({ coarsePointer: false, viewportWidth: 1440, deviceMemoryGB: 8, cores: 8 }), { tier: 'high', dpr: [1, 2], shadowMapSize: 2048 })
  assert.equal(chooseQuality({ coarsePointer: true, viewportWidth: 375 }).tier, 'balanced', 'phone')
  assert.equal(chooseQuality({ coarsePointer: false, viewportWidth: 600 }).tier, 'balanced', 'narrow window')
  assert.equal(chooseQuality({ coarsePointer: true, viewportWidth: 1024, deviceMemoryGB: 4 }).tier, 'balanced', 'modest touch tablet')
  assert.equal(chooseQuality({ coarsePointer: true, viewportWidth: 1024, deviceMemoryGB: 8, cores: 8 }).tier, 'high', 'capable tablet keeps full quality')
  assert.equal(chooseQuality({ coarsePointer: false, viewportWidth: 1440, deviceMemoryGB: 2, cores: 2 }).tier, 'high', 'a desktop is never downgraded by memory alone')
  assert.ok(chooseQuality({ coarsePointer: true, viewportWidth: 375 }).shadowMapSize >= 1024, 'shadows stay readable')

  // ---- SOURCE-PATTERN (needs a GPU/browser to execute) ---------------------------------------------------------
  const scene = read('src/components/restaurant-3d/RestaurantScene.vue')
  const table = read('src/components/restaurant-3d/RestaurantTable.vue')
  const ring = read('src/components/restaurant-3d/TableStatusRing.vue')
  assert.match(scene, /<ChairInstances\s+:tables="tables"\s+:hidden="hiddenChairs"/, 'one instanced chair set for the whole floor')
  assert.doesNotMatch(table, /<TresGroup\s+v-for="\(chair, index\) in chairs"/, 'no per-table chair meshes')
  assert.match(table, /:visible="false"/, 'the invisible hit area is raycast but not drawn')
  assert.match(scene, /const quality = chooseQuality\(detectDeviceHints\(\)\)/, 'tier chosen once per mount')
  assert.match(scene, /:dpr="quality\.dpr"/)
  assert.match(scene, /:shadow-mapSize-width="quality\.shadowMapSize"/)
  assert.match(ring, /key: `\$\{props\.visualState\}-\$\{index\}-\$\{band\.from\}-\$\{band\.to\}-\$\{band\.color\}/, 'ring bands remount when their look changes (hover -> selected used to throw inside TresJS)')

  console.log('frontend render performance checks passed')
} finally {
  await server.close()
}
