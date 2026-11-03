import assert from 'node:assert/strict'

await import('./support/primitives-runtime.mjs') // registers the .ts/@ resolver

// Persistence logic of the 3D floor editor (no browser needed): dirty baseline,
// save/rebase semantics, stale-save safety, table id format and the V1 document.
const { useEditableLayout } = await import('../src/components/restaurant-3d/use-editable-layout.ts')
const { createTableId } = await import('../src/components/restaurant-3d/table-defaults.ts')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
assert.match(createTableId(), UUID, 'new table ids are UUID v4')
assert.notEqual(createTableId(), createTableId(), 'ids are unique')

const seed = { tables: [{ id: createTableId(), number: 1, seats: 4, shape: 'square', position: { x: 0, z: 0 }, rotation: 0 }] }

// Empty layout: clean, valid V1 document with the floor spec.
const empty = useEditableLayout({ tables: [] })
assert.equal(empty.isDirty.value, false)
assert.deepEqual(empty.toDocument(), { version: 1, floor: { width: 20, depth: 16, gridStep: 0.25 }, tables: [] })

// Editing makes it dirty; the document carries the client UUID.
const layout = useEditableLayout(seed)
assert.equal(layout.isDirty.value, false)
const added = layout.addTable({ number: 2, shape: 'round', seats: 2 })
assert.ok(added.ok && UUID.test(added.table.id), 'added table gets a stable UUID')
assert.equal(layout.isDirty.value, true)

// Successful save: the saved document becomes the clean baseline.
const sent = layout.toDocument()
layout.markSaved(sent.tables, sent.tables)
assert.equal(layout.isDirty.value, false, 'dirty is false after a confirmed save')
assert.equal(layout.tables.value.length, 2)

// Edits made while the save was in flight are never overwritten and stay dirty.
const inFlight = layout.toDocument()
layout.removeTable(seed.tables[0].id)
layout.markSaved(inFlight.tables, inFlight.tables)
assert.equal(layout.tables.value.length, 1, 'newer local edit survives a stale response')
assert.equal(layout.isDirty.value, true, 'and is still unsaved')

// A failed save never calls markSaved: everything stays as edited and dirty.
const failed = useEditableLayout(seed)
failed.addTable({ number: 2, shape: 'square', seats: 4 })
failed.toDocument()
assert.equal(failed.isDirty.value, true)
assert.equal(failed.tables.value.length, 2)

console.log('Floor layout persistence checks: ok')
