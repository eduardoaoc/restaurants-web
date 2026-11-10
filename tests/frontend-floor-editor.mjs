import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

/**
 * Phase 3.1H-C table editor. RUNTIME sections execute the real layout composable and validators through Vite SSR.
 * SOURCE-PATTERN sections only read Vue files (pointer gestures, panel wiring) and are NOT browser verification.
 */
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const read = (p) => readFileSync(p, 'utf8')
try {
  const { useEditableLayout } = await server.ssrLoadModule('/src/components/restaurant-3d/use-editable-layout.ts')
  const v = await server.ssrLoadModule('/src/components/restaurant-3d/entrance-validation.ts')
  const T = (id, x, z, extra = {}) => ({ id, number: Number(id.replace(/\D/g, '') || 1), seats: 4, shape: 'round', position: { x, z }, rotation: 0, ...extra })
  const make = () => useEditableLayout({ tables: [T('t1', -4, 0, { backendTableId: 41 }), T('t2', 4, 0)] })

  // ---- RUNTIME: drag, grid snap, floor bounds ----------------------------------------------------------------
  let ed = make()
  assert.equal(ed.moveTable('t1', { x: -3.9, z: 1.13 }).ok, true)
  assert.deepEqual(ed.tableById('t1').position, { x: -4, z: 1.25 }, 'drag snaps to the 0.25 m grid')
  assert.equal(ed.moveTable('t1', { x: -99, z: 0 }).ok, true)
  assert.ok(ed.tableById('t1').position.x > -10 && ed.tableById('t1').position.x < -8, 'drag is clamped to the floor, never off it')
  assert.equal(ed.tableById('t1').id, 't1', 'UUID preserved')
  assert.equal(ed.tableById('t1').backendTableId, 41, 'mapping preserved by moving')

  // ---- RUNTIME: collisions are refused, nothing is moved or pushed --------------------------------------------
  ed = make()
  const before = { ...ed.tableById('t1').position }
  const blocked = ed.moveTable('t1', { x: 4, z: 0 })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.issues[0].code, 'collision')
  assert.deepEqual(ed.tableById('t1').position, before, 'refused drag leaves the table where it was')
  assert.deepEqual(ed.tableById('t2').position, { x: 4, z: 0 }, 'the other table is never pushed')

  // ---- RUNTIME: typed X/Z ---------------------------------------------------------------------------------------
  assert.equal(ed.setTablePosition('t1', { x: -2.1, z: 3 }).ok, true)
  assert.deepEqual(ed.tableById('t1').position, { x: -2, z: 3 }, 'typed value snapped to grid')
  assert.equal(ed.setTablePosition('t1', { x: 4, z: 0 }).ok, false, 'typed overlap rejected')
  assert.equal(ed.setTablePosition('t1', { x: 40, z: 0 }).issues[0].code, 'out_of_floor', 'typed out-of-floor rejected, not clamped')
  assert.equal(ed.setTablePosition('t1', { x: NaN, z: 0 }).ok, false, 'non-numeric rejected')
  assert.deepEqual(ed.tableById('t1').position, { x: -2, z: 3 }, 'rejections never reposition')
  assert.equal(ed.tableById('t1').backendTableId, 41)

  // ---- RUNTIME: numeric input handling (v-model on type=number yields numbers) ---------------------------------
  const { parseCoordinate } = await server.ssrLoadModule('/src/components/restaurant-3d/layout-editing.ts')
  assert.equal(parseCoordinate(2.5), 2.5)
  assert.equal(parseCoordinate('2.5'), 2.5)
  assert.equal(parseCoordinate(0), 0, 'zero is a valid coordinate, not "empty"')
  assert.ok(Number.isNaN(parseCoordinate('')), 'empty is NaN, never 0')
  assert.ok(Number.isNaN(parseCoordinate('abc')))
  assert.ok(Number.isNaN(parseCoordinate(NaN)))
  assert.ok(Number.isNaN(parseCoordinate(Infinity)))
  assert.ok(Number.isNaN(parseCoordinate(null)))

  // ---- RUNTIME: rotation ---------------------------------------------------------------------------------------
  ed = useEditableLayout({ tables: [T('t1', 0, 0, { shape: 'rectangular', seats: 6, backendTableId: 7 })] })
  assert.equal(ed.rotateTable('t1', 1).ok, true)
  assert.equal(ed.tableById('t1').rotation, 15)
  assert.equal(ed.rotateTable('t1', -1).ok && ed.rotateTable('t1', -1).ok, true)
  assert.equal(ed.tableById('t1').rotation, 345, 'rotation wraps')
  assert.equal(ed.tableById('t1').backendTableId, 7, 'mapping preserved by rotating')
  const tight = useEditableLayout({ tables: [T('r1', 0, 0, { shape: 'rectangular', seats: 6 }), T('r2', 0, 1.7, { shape: 'rectangular', seats: 6 })] })
  const rot = tight.rotateTable('r1', 1)
  assert.equal(rot.ok, false, 'a turn that would overlap a neighbour is refused')
  assert.equal(tight.tableById('r1').rotation, 0)

  // ---- RUNTIME: add / duplicate / delete / shape / capacity ----------------------------------------------------
  ed = make()
  const added = ed.addTable({ number: 9, shape: 'square', seats: 4 })
  assert.equal(added.ok, true)
  assert.equal(ed.addTable({ number: 9, shape: 'square', seats: 4 }).ok, false, 'table numbers stay unique')
  const dup = ed.duplicateTable('t1')
  assert.equal(dup.ok, true)
  assert.notEqual(dup.table.id, 't1', 'duplicate gets its own UUID')
  assert.equal(dup.table.backendTableId, undefined, 'a duplicate never inherits the backend table link')
  assert.notEqual(dup.table.number, ed.tableById('t1').number)
  assert.equal(ed.updateTable('t2', { shape: 'rectangular', seats: 6 }).ok, true, 'shape and capacity update')
  assert.equal(ed.updateTable('t2', { seats: 0 }).ok, false, 'invalid capacity refused')
  assert.equal(ed.updateTable('t2', { number: ed.tableById('t1').number }).ok, false, 'duplicate number refused')
  const guarded = useEditableLayout({ tables: [T('t1', 0, 0, { seats: 8, backendTableId: 3 })] }, { minSeatsFor: () => 6 })
  assert.equal(guarded.updateTable('t1', { seats: 4 }).ok, false, 'capacity below active guests refused')
  assert.equal(guarded.tableById('t1').backendTableId, 3, 'mapping preserved by shape/capacity edits')
  ed.removeTable('t1')
  assert.equal(ed.tableById('t1'), undefined)

  // ---- RUNTIME: entrance / table interaction -------------------------------------------------------------------
  const lay = [T('t1', 0, 0)]
  ed = useEditableLayout({ tables: lay, entrance: { x: 0, z: 7.5 } })
  assert.equal(v.validateEntrancePlacement(ed.tables.value, ed.entrance.value).ok, true)
  assert.equal(ed.moveTable('t1', { x: 0, z: 7.5 }).ok, true, 'a table may be dragged where the entrance is')
  assert.equal(v.validateEntrancePlacement(ed.tables.value, ed.entrance.value).ok, false, '...which invalidates the entrance, blocking save')

  // ---- RUNTIME: save and discard -------------------------------------------------------------------------------
  ed = make()
  ed.moveTable('t1', { x: -3, z: 2 })
  ed.setBackendTable('t2', 55)
  assert.equal(ed.isDirty.value, true)
  const sent = ed.toDocument()
  ed.markSaved(sent.tables, sent.tables)
  assert.equal(ed.isDirty.value, false)
  ed.moveTable('t1', { x: -2, z: 2 })
  ed.discard()
  assert.deepEqual(ed.tableById('t1').position, { x: -3, z: 2 }, 'discard restores the last confirmed save')
  assert.equal(ed.tableById('t2').backendTableId, 55)

  // ---- SOURCE-PATTERN (no browser) ------------------------------------------------------------------------------
  const ctl = read('src/components/restaurant-3d/TableEditController.vue')
  const scene = read('src/components/restaurant-3d/RestaurantScene.vue')
  const view = read('src/views/experiments/Restaurant3DView.vue')
  assert.match(ctl, /DRAG_START_PX = \{ mouse: 5, pen: 6, touch: 10 \}/, 'touch needs a larger drag threshold than a mouse')
  assert.match(ctl, /if \(Math\.hypot\(move\.clientX - pressed\.x[\s\S]*< threshold\) return/, 'a press only selects until the pointer travels')
  assert.match(ctl, /event\.pointerType === 'touch'\) return\s*\n\s*lastHover = event/, 'no hover raycasts for touch')
  assert.match(ctl, /requestAnimationFrame/, 'hover raycast is throttled to one per frame')
  assert.match(scene, /layoutEditing && !draggingTable && table\.id === hoveredTableId/, 'hover feedback is edit-mode only and off while dragging')
  assert.match(scene, /:enabled="behavior\.showOperational"/, 'guest animations stay disabled while editing')
  const toolbar = read('src/components/restaurant-3d/EditorToolbar.vue')
  const panel = read('src/components/restaurant-3d/EntrancePanel.vue')
  const marker = read('src/components/restaurant-3d/EntranceFloorMarker.vue')
  assert.doesNotMatch(toolbar + panel, /\.value\.trim\(\)/, 'number inputs are never treated as strings')
  assert.match(toolbar, /parseCoordinate\(px\.value\)/)
  assert.match(panel, /parseCoordinate\(x\.value\)/)
  assert.doesNotMatch(marker, /:raycast=/, 'raycast is not a Tres prop (it would CALL Mesh.raycast); it is assigned on the object')
  assert.match(marker, /\.raycast = \(\) => \{\}/)
  assert.match(scene, /\.restaurant-scene \{ isolation: isolate; \}/, 'dock and 3D labels stack inside the scene only')
  assert.match(scene, /\.editor-overlay \{\s*z-index: 20;/, 'dock above the labels, locally')
  assert.match(scene, /function onTypeEntrance[\s\S]*'invalid_coordinates'[\s\S]*'outside_floor'/, 'typed entrance values are refused, not clamped')
  assert.match(scene, /editor-dock--collapsed/, 'dock collapses')
  assert.match(scene, /matchMedia\('\(max-width: 640px\)'\)\.matches\)/, 'dock starts collapsed on narrow screens')
  assert.match(scene, /env\(safe-area-inset-bottom\)/, 'safe-area inset')
  assert.match(scene, /watch\(editSelectedId[\s\S]*dockTab\.value = 'table'/, 'selecting in the scene opens the table section (3D <-> panel stay in sync)')
  assert.match(view, /else if \(action === 'conflict'\) markStale\(\)/, 'conflict protection still guards the draft')
  assert.match(view, /:key="`\$\{restaurantId\}-\$\{revision\}`"/, 'scene only remounts on restaurant switch / reload, not on selection')
  for (const locale of ['es-ES', 'en-GB', 'ca-ES-valencia']) {
    const t = read(`src/i18n/locales/${locale}.ts`)
    for (const key of ['tabTable:', 'tabEntrance:', 'selectHint:', 'positionX:', 'positionZ:', 'collapse:', 'expand:']) assert.ok(t.includes(key), `${locale} editor.${key}`)
  }

  console.log('frontend floor editor checks passed')
} finally {
  await server.close()
}
