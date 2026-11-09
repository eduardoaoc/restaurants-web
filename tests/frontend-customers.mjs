// Phase 3.1D — seated customers on the operational floor: pure placement / identity / variant logic.
// Fixture-based (mock layout + guest fixtures); no backend, no browser.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

try {
  const place = await server.ssrLoadModule('/src/components/restaurant-3d/characters/customer-placement.ts')
  const geo = await server.ssrLoadModule('/src/components/restaurant-3d/table-geometry.ts')
  const { mockLayout } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-layout.ts')
  const { mockOperationalState } = await server.ssrLoadModule('/src/data/restaurant-3d/mock-operational-state.ts')
  const { guestFixture } = await server.ssrLoadModule('/src/data/restaurant-3d/guest-fixtures.ts')


  const tables = mockLayout.tables
  const explicit = Object.values(mockOperationalState).reduce((n, s) => n + s.guests.length, 0)
  const placements = place.computeCustomerPlacements(tables, mockOperationalState)

  check('1 empty tables get nobody', () => {
    for (const id of ['table-1', 'table-4']) assert.equal(placements.filter(p => p.tableId === id).length, 0)
    assert.deepEqual(place.computeCustomerPlacements(tables, {}), [])
  })
  check('2/3 one customer per explicit guest record', () => {
    assert.equal(placements.length, explicit)
    assert.equal(new Set(placements.map(p => p.guestId)).size, explicit)
    for (const [tableId, s] of Object.entries(mockOperationalState)) {
      assert.equal(placements.filter(p => p.tableId === tableId).length, s.guests.length)
    }
  })
  check('empty seats of a part-filled table stay empty (table-5: seats 2 and 5 free)', () => {
    const seats = placements.filter(p => p.tableId === 'table-5').map(p => p.seatIndex).sort()
    assert.deepEqual(seats, [0, 1, 3, 4])
  })
  check('invalid / duplicate seat indexes produce no extra customer', () => {
    const bad = { 'table-1': { tableId: 'table-1', status: 'occupied', occupiedAt: null,
      guests: [{ id: 'a', seatIndex: 0 }, { id: 'b', seatIndex: 0 }, { id: 'c', seatIndex: 9 }] } }
    assert.deepEqual(place.computeCustomerPlacements(tables, bad).map(p => p.guestId), ['a'])
  })
  check('state for an unknown table is ignored', () => {
    const s = { ghost: { tableId: 'ghost', status: 'occupied', occupiedAt: null, guests: [{ id: 'g', seatIndex: 0 }] } }
    assert.deepEqual(place.computeCustomerPlacements(tables, s), [])
  })

  check('every supported table shape yields placements', () => {
    const shapes = new Set(placements.map(p => tables.find(t => t.id === p.tableId).shape))
    assert.deepEqual([...shapes].sort(), ['rectangular', 'round', 'square'])
  })

  const forward = yaw => ({ x: Math.sin(yaw), z: Math.cos(yaw) })
  check('6 customers sit on their chair and face the table (all shapes, incl. the rotated table)', () => {
    for (const p of placements) {
      const t = tables.find(x => x.id === p.tableId)
      const chair = geo.getChairPlacements(t)[p.seatIndex]
      const w = place.chairWorldTransform(t, chair)
      assert.ok(Math.hypot(p.x - w.x, p.z - w.z) < 1e-9)
      const f = forward(p.yaw)
      const toTable = { x: t.position.x - p.x, z: t.position.z - p.z }
      const len = Math.hypot(toTable.x, toTable.z)
      const cos = (f.x * toTable.x + f.z * toTable.z) / len
      // Chairs on the table's own axes face the centre exactly; off-centre seats still face the table side.
      assert.ok(cos > 0.5, `${p.guestId} faces away from its table (cos ${cos.toFixed(2)})`)
    }
  })
  check('centre-axis seats look straight at the table centre', () => {
    const t = tables.find(x => x.id === 'table-3') // round, 4 seats: seats are on the axes
    for (const p of placements.filter(q => q.tableId === 'table-3')) {
      const f = forward(p.yaw)
      const to = { x: t.position.x - p.x, z: t.position.z - p.z }
      const len = Math.hypot(to.x, to.z)
      assert.ok((f.x * to.x + f.z * to.z) / len > 0.999)
    }
  })

  check('4 rotating a table rotates positions and yaw consistently', () => {
    const t = { ...tables.find(x => x.id === 'table-5') }
    const before = place.computeCustomerPlacements([t], mockOperationalState['table-5'] ? { [t.id]: mockOperationalState['table-5'] } : {})
    const rotated = place.computeCustomerPlacements([{ ...t, rotation: t.rotation + 90 }], { [t.id]: mockOperationalState['table-5'] })
    for (let i = 0; i < before.length; i++) {
      assert.ok(Math.abs(rotated[i].yaw - (before[i].yaw + Math.PI / 2)) < 1e-9)
      // distance from the table centre is preserved by a rotation
      const d0 = Math.hypot(before[i].x - t.position.x, before[i].z - t.position.z)
      const d1 = Math.hypot(rotated[i].x - t.position.x, rotated[i].z - t.position.z)
      assert.ok(Math.abs(d0 - d1) < 1e-9)
    }
    // table-7 is already rotated 90 degrees in the mock: its customers must NOT be placed as if it were 0
    const t7 = tables.find(x => x.id === 'table-7')
    const as0 = place.computeCustomerPlacements([{ ...t7, rotation: 0 }], { 'table-7': mockOperationalState['table-7'] })
    const as90 = place.computeCustomerPlacements([t7], { 'table-7': mockOperationalState['table-7'] })
    assert.ok(as0.some((p, i) => Math.hypot(p.x - as90[i].x, p.z - as90[i].z) > 0.3))
  })
  check('moving a table moves customers by the same offset (identity is the guest id)', () => {
    const t = tables.find(x => x.id === 'table-2')
    const a = place.computeCustomerPlacements([t], { 'table-2': mockOperationalState['table-2'] })
    const b = place.computeCustomerPlacements([{ ...t, position: { x: t.position.x + 2, z: t.position.z - 1 } }], { 'table-2': mockOperationalState['table-2'] })
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].guestId, b[i].guestId)
      assert.ok(Math.abs(b[i].x - a[i].x - 2) < 1e-9 && Math.abs(b[i].z - a[i].z + 1) < 1e-9)
    }
  })

  check('7 variants are deterministic, varied in gender and outfit, and repeats are allowed', () => {
    const ids = placements.map(p => p.guestId)
    const v1 = ids.map(id => place.customerVariant(id))
    const v2 = ids.map(id => place.customerVariant(id))
    assert.deepEqual(v1, v2)
    assert.ok(v1.some(v => v.gender === 'men') && v1.some(v => v.gender === 'women'))
    assert.ok(new Set(v1.map(v => v.url)).size >= 4, 'at least 4 of the 6 outfits used by the 19 mock guests')
    assert.ok(new Set(v1.map(v => v.url)).size < ids.length, 'variants repeat (19 guests, 6 outfits)')
    assert.equal(place.customerVariant('guest-table-2-1').url, place.customerVariant('guest-table-2-1').url)
    assert.ok(place.customerPhase('x') >= 0 && place.customerPhase('x') < 1)
    // appearance depends on the id only, not on seat or table
    assert.deepEqual(place.customerVariant('same-id'), place.customerVariant('same-id'))
  })
  check('gender/outfit mix per table is varied for the fixture ids', () => {
    const f = guestFixture(mockLayout, 20)
    const ps = place.computeCustomerPlacements(tables, f)
    const genders = ps.map(p => place.customerVariant(p.guestId).gender)
    const men = genders.filter(g => g === 'men').length
    assert.ok(men >= 6 && men <= 14, `gender split ${men}/${20 - men}`)
  })

  check('fixture counts: 1/5/10/20 explicit guests give exactly that many customers', () => {
    for (const n of [0, 1, 5, 10, 20]) {
      const f = guestFixture(mockLayout, n)
      assert.equal(place.computeCustomerPlacements(tables, f).length, n)
    }
  })

  check('production chair spec mirrors table-geometry', () => {
    assert.equal(place.TABLE_CHAIR_SPEC.seatHeight, geo.CHAIR_SEAT_HEIGHT)
    assert.equal(place.TABLE_CHAIR_SPEC.seatWidth, geo.CHAIR_SEAT_SIZE)
    assert.equal(place.TABLE_CHAIR_SPEC.backrestHeight, geo.CHAIR_BACK_HEIGHT)
  })

} finally {
  await server.close()
}
console.log(`frontend-customers: ${checks} checks passed`)
