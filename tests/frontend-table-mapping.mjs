import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { tableMappingState, validateTableMappings, hasCapacityMismatch, minSeatsForBackendTable, validateCapacityAgainstOccupancy } = await server.ssrLoadModule('/src/components/restaurant-3d/table-mapping.ts')
  const { useEditableLayout } = await server.ssrLoadModule('/src/components/restaurant-3d/use-editable-layout.ts')

  const visual = (id, backendTableId, number = 4, seats = 4) => ({
    id, backendTableId, number, seats, shape: 'round', position: { x: 0, z: 0 }, rotation: 0,
  })
  const backend = (id, restaurantId = 12, capacity = 4, number = 4) => ({
    id, restaurant_id: restaurantId, name: `Mesa real ${id}`, number, capacity,
  })
  const first = visual('visual-a', undefined, 4)
  const second = visual('visual-b', undefined, 5)
  const candidates = [backend(40), backend(41, 12, 6, 5)]

  assert.equal(tableMappingState(first, [first], candidates, 12), 'unmapped', 'same table number never creates an implicit link')
  assert.equal(tableMappingState(visual('visual-a', 40), [visual('visual-a', 40)], candidates, 12), 'mapped')
  assert.equal(tableMappingState(visual('visual-a', 404), [visual('visual-a', 404)], candidates, 12), 'missing')
  assert.equal(tableMappingState(visual('visual-a', 40), [visual('visual-a', 40)], [backend(40, 13)], 12), 'missing', 'other-restaurant IDs do not validate')
  assert.equal(tableMappingState(visual('visual-a', 40), [visual('visual-a', 40), visual('visual-b', 40)], candidates, 12), 'conflict')
  assert.deepEqual(validateTableMappings([visual('visual-a', 40), visual('visual-b', 40)], candidates, 12), [
    { tableId: 'visual-a', kind: 'conflict' }, { tableId: 'visual-b', kind: 'conflict' },
  ])
  assert.equal(hasCapacityMismatch(first, candidates[0]), false)
  assert.equal(hasCapacityMismatch(first, candidates[1]), true)
  assert.equal(hasCapacityMismatch(first, backend(42, 12, null)), false, 'unknown backend capacity is not rewritten or guessed')

  const editor = useEditableLayout({ tables: [visual('visual-a', 40), second] })
  assert.equal(editor.setBackendTable('visual-b', 40), false, 'duplicate assignment is refused in the draft')
  assert.equal(editor.setBackendTable('visual-b', 41), true)
  assert.equal(editor.isDirty.value, true, 'mapping changes mark the shared layout draft dirty')
  assert.equal(editor.savedTables.value[1].backendTableId, undefined, 'an unsaved association does not become operational')
  const sent = editor.toDocument()
  assert.equal(sent.tables[1].backendTableId, 41)
  assert.equal(sent.tables[1].id, 'visual-b', 'mapping preserves the visual UUID')
  editor.discard()
  assert.equal(editor.isDirty.value, false, 'discard restores the saved mapping state')
  assert.equal(editor.tableById('visual-b').backendTableId, undefined)

  assert.equal(editor.setBackendTable('visual-b', 41), true)
  editor.markSaved(editor.toDocument().tables, editor.toDocument().tables)
  assert.equal(editor.isDirty.value, false)
  assert.equal(editor.savedTables.value[1].backendTableId, 41, 'a confirmed save becomes the operational association')
  assert.equal(editor.setBackendTable('visual-b', null), true, 'unmapping is explicit and supported')
  editor.discard()
  assert.equal(editor.tableById('visual-b').backendTableId, 41, 'discard restores the last confirmed save')
  assert.equal(editor.tableById('visual-b').seats, 4, 'mapping and discard never rewrite visual capacity')

  const counts = new Map([[40, 6]])
  assert.equal(minSeatsForBackendTable(visual('visual-a', 40), counts), 6)
  assert.equal(minSeatsForBackendTable(visual('visual-a', undefined), counts), 0, 'unmapped tables have no occupancy floor')
  assert.deepEqual(validateCapacityAgainstOccupancy([visual('visual-a', 40, 4, 4), visual('visual-b', 41, 5, 4)], counts), [{ tableId: 'visual-a', seats: 4, guests: 6 }])
  assert.deepEqual(validateCapacityAgainstOccupancy([visual('visual-a', 40, 4, 6)], counts), [], 'equal capacity is accepted')
  const guarded = useEditableLayout({ tables: [visual('visual-a', 40, 4, 8)] }, { minSeatsFor: (id) => minSeatsForBackendTable(guarded.tableById(id), counts) })
  assert.equal(guarded.updateTable('visual-a', { seats: 5 }).ok, false, 'capacity below authoritative guests is rejected')
  assert.equal(guarded.updateTable('visual-a', { seats: 6 }).ok, true)
  assert.equal(guarded.updateTable('visual-a', { seats: 0 }).ok, false, 'invalid capacity rejected')

  const view = readFileSync('src/views/experiments/Restaurant3DView.vue', 'utf8')
  assert.match(view, /else if \(action === 'conflict'\) markStale\(\)\s*\n\s*else if \(action === 'reload'\) await reload\(\)/, 'external updates never reload over a dirty draft')
  assert.match(view, /:save-blocked="staleDraft"/, 'saving is blocked while a remote conflict is unresolved')
  assert.match(view, /watch\(restaurantId[\s\S]*staleDraft\.value = false/, 'restaurant switch resets conflict state')

  console.log('frontend table mapping checks passed')
} finally {
  await server.close()
}
