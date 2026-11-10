import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { mapOperationalGuests } = await server.ssrLoadModule('/src/components/restaurant-3d/operational-guest-mapper.ts')
  const { useEditableLayout } = await server.ssrLoadModule('/src/components/restaurant-3d/use-editable-layout.ts')
  const table = { id: 'layout-uuid', backendTableId: 41, number: 7, seats: 4, shape: 'round', position: { x: 0, z: 0 }, rotation: 0 }
  const active = { id: 41, restaurant_id: 3, primary_status: 'occupied', session: { id: 900, guest_count: 2, status: 'occupied', opened_at: '2026-11-10T10:00:00Z' } }

  const first = mapOperationalGuests(table, active)
  assert.deepEqual(first, [{ id: '900:seat:0', seatIndex: 0 }, { id: '900:seat:1', seatIndex: 1 }])
  assert.deepEqual(mapOperationalGuests(table, active), first, 'repeated snapshots preserve guest identity')
  assert.notEqual(mapOperationalGuests(table, { ...active, session: { ...active.session, id: 901 } })[0].id, first[0].id, 'session replacement changes visual identity')
  assert.deepEqual(mapOperationalGuests({ ...table, backendTableId: undefined }, active), [], 'unmapped layout tables never consume operational state')
  assert.deepEqual(mapOperationalGuests(table, { ...active, id: 42 }), [], 'mismatched backend table is ignored')
  assert.deepEqual(mapOperationalGuests(table, { ...active, session: null }), [])
  assert.deepEqual(mapOperationalGuests(table, { ...active, session: { ...active.session, guest_count: 0 } }), [])
  assert.throws(() => mapOperationalGuests(table, { ...active, session: { ...active.session, guest_count: 5 } }), RangeError)
  assert.throws(() => mapOperationalGuests(table, { ...active, session: { ...active.session, guest_count: -1 } }), RangeError)
  assert.throws(() => mapOperationalGuests(table, { ...active, session: { ...active.session, guest_count: 1.5 } }), RangeError)

  const legacy = { tables: [{ ...table, backendTableId: undefined }] }
  const editableLegacy = useEditableLayout(legacy)
  assert.equal(editableLegacy.toDocument().tables[0].backendTableId, undefined, 'legacy layout remains unmapped')
  assert.equal(editableLegacy.toDocument().entrance, undefined, 'legacy layout does not gain a fabricated entrance')
  const persisted = { entrance: { x: 1, z: -2 }, tables: [table] }
  const editable = useEditableLayout(persisted)
  const document = editable.toDocument()
  assert.deepEqual(document.entrance, persisted.entrance, 'entrance survives editor save mapping')
  assert.equal(document.tables[0].backendTableId, 41, 'explicit backend table mapping survives editor save mapping')
  assert.equal(editable.duplicateTable('layout-uuid').ok, true)
  assert.equal(editable.toDocument().tables[1].backendTableId, undefined, 'duplicated layout table requires explicit mapping')
  console.log('frontend operational contracts: 13 checks passed')
} finally {
  await server.close()
}
