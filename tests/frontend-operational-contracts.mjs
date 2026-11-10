import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { mapOperationalGuests } = await server.ssrLoadModule('/src/components/restaurant-3d/operational-guest-mapper.ts')
  const { mapOperationsFloor } = await server.ssrLoadModule('/src/components/restaurant-3d/operations-floor-mapper.ts')
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

  const operationsTable = {
    id: 41, name: 'Table 41', number: 7, capacity: 4, zone_id: null,
    layout: { x: null, y: null, rotation: null, shape: null, width: null, height: null },
    primary_status: 'occupied', flags: ['unassigned'],
    session: { id: 900, status: 'occupied', opened_at: '2026-11-10T10:00:00Z', started_at: '2026-11-10T10:00:00Z', elapsed_seconds: 0, guest_count: 2, guest_count_version: 1, assigned_waiter: null },
    orders: { open_count: 0, waiting_approval: 0, preparing: 0, ready: 0 }, billing: null,
  }
  const live = { restaurant: { id: 3 }, floors: [{ zones: [{ tables: [operationsTable] }] }], unassigned_tables: [] }
  const mapped = mapOperationsFloor({ tables: [table] }, live, 3)
  assert.deepEqual(mapped.state['layout-uuid'].guests, first, 'Operations Live resolves through backendTableId and keeps deterministic guest IDs')
  assert.equal(mapped.state['layout-uuid'].occupiedAt, operationsTable.session.opened_at, 'opened_at becomes the visual occupancy timestamp')
  assert.deepEqual(mapped.flagsByLayoutId['layout-uuid'], ['unassigned'], 'authoritative attention flags are retained')
  assert.equal(mapped.tablesByLayoutId['layout-uuid'].id, 41, 'selected layout table resolves to its exact backend table')

  const unmapped = mapOperationsFloor({ tables: [{ ...table, backendTableId: null }] }, live, 3)
  assert.deepEqual(unmapped.state, {}, 'unmapped geometry never inherits operational occupancy')
  const stale = mapOperationsFloor({ tables: [{ ...table, backendTableId: 404 }] }, live, 3)
  assert.deepEqual(stale.state, {}, 'stale backend table references fail closed')
  assert.deepEqual(stale.invalidLayoutIds, ['layout-uuid'], 'stale mapping is reported')
  const duplicate = mapOperationsFloor({ tables: [table, { ...table, id: 'second-layout-id' }] }, live, 3)
  assert.deepEqual(duplicate.state, {}, 'duplicate backend assignments fail closed')
  assert.deepEqual(duplicate.invalidLayoutIds.sort(), ['layout-uuid', 'second-layout-id'], 'duplicate mappings are reported')
  assert.deepEqual(mapOperationsFloor({ tables: [table] }, live, 4).state, {}, 'snapshot from another restaurant fails closed')

  const overflow = mapOperationsFloor({ tables: [{ ...table, seats: 1 }] }, live, 3)
  assert.equal(overflow.state['layout-uuid'], undefined, 'visual-capacity overflow suppresses operational state and actors')
  const backendOverflow = mapOperationsFloor({ tables: [table] }, { ...live, floors: [{ zones: [{ tables: [{ ...operationsTable, capacity: 1 }] }] }] }, 3)
  assert.equal(backendOverflow.state['layout-uuid'], undefined, 'backend capacity overflow suppresses operational state and actors')

  const closed = mapOperationsFloor({ tables: [table] }, { ...live, floors: [{ zones: [{ tables: [{ ...operationsTable, primary_status: 'free', flags: [], session: null }] }] }] }, 3)
  assert.deepEqual(closed.state['layout-uuid'].guests, [], 'closed sessions represented as no active session do not render guests')
  const replacement = mapOperationsFloor({ tables: [table] }, { ...live, floors: [{ zones: [{ tables: [{ ...operationsTable, session: { ...operationsTable.session, id: 901 } }] }] }] }, 3)
  assert.notEqual(replacement.state['layout-uuid'].guests[0].id, first[0].id, 'new session identity replaces the old visual identities')

  const destination = { ...table, id: 'destination-layout-id', backendTableId: 42 }
  const transferredTable = { ...operationsTable, id: 42, session: { ...operationsTable.session } }
  const transfer = mapOperationsFloor({ tables: [table, destination] }, { ...live, floors: [{ zones: [{ tables: [{ ...operationsTable, primary_status: 'free', flags: [], session: null }, transferredTable] }] }] }, 3)
  assert.deepEqual(transfer.state['destination-layout-id'].guests.map(guest => guest.id), first.map(guest => guest.id), 'transfer preserves session-derived actor IDs at the destination')
  assert.deepEqual(transfer.state['layout-uuid'].guests, [], 'transfer removes occupancy from the source mapping')

  console.log('frontend operational contracts passed')
} finally {
  await server.close()
}
