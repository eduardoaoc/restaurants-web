import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

/**
 * Phase 3.1H-B. RUNTIME sections load the real modules through Vite (SSR) and execute them: entrance validation,
 * the editable layout draft, the A* planners. SOURCE-PATTERN sections only grep the Vue files for wiring that cannot
 * be executed without a browser; they are labelled as such.
 */
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const read = (path) => readFileSync(path, 'utf8')
try {
  const v = await server.ssrLoadModule('/src/components/restaurant-3d/entrance-validation.ts')
  const { useEditableLayout } = await server.ssrLoadModule('/src/components/restaurant-3d/use-editable-layout.ts')
  const nav = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/floor-nav.ts')
  const route = await server.ssrLoadModule('/src/components/restaurant-3d/navigation/route-path.ts')
  const placement = await server.ssrLoadModule('/src/components/restaurant-3d/characters/customer-placement.ts')

  const table = (id, x, z, seats = 4, shape = 'round') => ({ id, number: 1, seats, shape, position: { x, z }, rotation: 0 })
    const one = [table('a', 0, 0)]

  // ---- RUNTIME: 1/2/3 add, move, remove (draft) ----------------------------------------------------------------
  const editor = useEditableLayout({ tables: [table('a', 0, 0)] })
  assert.equal(editor.entrance.value, null)
  assert.equal(editor.isDirty.value, false)
  assert.deepEqual(editor.setEntrance({ x: 0, z: 7.4 }), { x: 0, z: 7.5 }, 'added entrance snaps to the grid')
  assert.equal(editor.isDirty.value, true, 'adding an entrance marks the layout dirty')
  assert.deepEqual(editor.setEntrance({ x: 4.9, z: 7.6 }), { x: 5, z: 7.5 }, 'moving snaps to the grid')
  assert.deepEqual(editor.setEntrance({ x: 99, z: -99 }), { x: 9.25, z: -7.5 }, 'dragging far away is clamped to the navigable floor, not rejected silently elsewhere')
  assert.equal(editor.setEntrance(null), null)
  assert.equal(editor.isDirty.value, false, 'removing an entrance that was never saved returns to clean')
  assert.equal('entrance' in editor.toDocument(), false, 'no entrance key when none ever existed (old layouts unchanged)')

  // ---- RUNTIME: 4 save and reload ------------------------------------------------------------------------------
  editor.setEntrance({ x: 3, z: 7.5 })
  const sent = editor.toDocument()
  assert.deepEqual(sent.entrance, { x: 3, z: 7.5 })
  editor.markSaved(sent.tables, sent.tables, { canonical: sent.entrance, sent: sent.entrance })
  assert.equal(editor.isDirty.value, false, 'a confirmed save makes the entrance the clean baseline')
  const reloaded = useEditableLayout({ tables: sent.tables, entrance: { x: 3, z: 7.5 } })
  assert.deepEqual(reloaded.entrance.value, { x: 3, z: 7.5 }, 'reload restores the persisted entrance')
  assert.equal(reloaded.isDirty.value, false)

  // Removing a SAVED entrance must be sent as an explicit null, otherwise the server keeps the old one.
  editor.setEntrance(null)
  assert.equal(editor.isDirty.value, true)
  assert.equal(editor.toDocument().entrance, null)
  // An edit made while the save was in flight is kept (existing markSaved rule, now for the entrance too).
  editor.discard()
  editor.setEntrance({ x: 4, z: 7.5 })
  const inFlight = editor.toDocument()
  editor.setEntrance({ x: 5, z: 7.5 })
  editor.markSaved(inFlight.tables, inFlight.tables, { canonical: inFlight.entrance, sent: inFlight.entrance })
  assert.deepEqual(editor.entrance.value, { x: 5, z: 7.5 }, 'newer entrance edit survives the save response')
  assert.equal(editor.isDirty.value, true)

  // ---- RUNTIME: 12 persisted vs draft entrance --------------------------------------------------------------
  const split = useEditableLayout({ tables: one, entrance: { x: 0, z: 7.5 } })
  split.setEntrance({ x: 4, z: 7.5 })
  assert.deepEqual(split.entrance.value, { x: 4, z: 7.5 }, 'draft moves')
  assert.deepEqual(split.savedEntrance.value, { x: 0, z: 7.5 }, 'persisted entrance is untouched by draft edits')
  split.setEntrance(null)
  assert.deepEqual(split.savedEntrance.value, { x: 0, z: 7.5 }, 'removing the draft does not remove the persisted one')
  split.setEntrance({ x: 4, z: 7.5 })
  const splitSent = split.toDocument()
  split.markSaved(splitSent.tables, splitSent.tables, { canonical: { x: 4, z: 7.5 }, sent: { x: 4, z: 7.5 } })
  assert.deepEqual(split.savedEntrance.value, { x: 4, z: 7.5 }, 'it becomes operational only after the confirmed save')

  // ---- RUNTIME: 5 discard --------------------------------------------------------------------------------------
  editor.discard()
  assert.deepEqual(editor.entrance.value, { x: 4, z: 7.5 }, 'discard restores the last saved entrance')
  assert.equal(editor.isDirty.value, false)
  assert.deepEqual(editor.savedEntrance.value, { x: 4, z: 7.5 })

  // Tables and entrance share one draft: a table edit + entrance edit are discarded together.
  editor.moveTable('a', { x: 1, z: 1 })
  editor.setEntrance(null)
  editor.discard()
  assert.deepEqual(editor.tableById('a').position, { x: 0, z: 0 })
  assert.deepEqual(editor.entrance.value, { x: 4, z: 7.5 })

  // ---- RUNTIME: 6 invalid coordinates --------------------------------------------------------------------------
  assert.equal(v.validateEntrancePlacement(one, { x: NaN, z: 0 }).issue, 'invalid_coordinates')
  assert.equal(v.validateEntrancePlacement(one, { x: 0, z: Infinity }).issue, 'invalid_coordinates')
  assert.equal(v.validateEntrancePlacement(one, { x: 9.9, z: 0 }).issue, 'outside_floor', 'inside the floor but in the edge margin')
  assert.equal(v.validateEntrancePlacement(one, { x: 0, z: -12 }).issue, 'outside_floor')
  assert.equal(v.validateEntrancePlacement(one, { x: 0, z: 7.5 }).ok, true)
  assert.equal(v.validateEntrancePlacement(one, { x: 9.5, z: 0 }).issue, 'no_navigation_start', 'the outermost grid line has no walkable A* start cell')
  assert.deepEqual(v.entranceLimits(), { x: 9.25, z: 7.5 }, 'drag limit is the outermost grid line that can start a route')
  const typed = useEditableLayout({ tables: one })
  const kept = typed.setEntrance({ x: NaN, z: 2 })
  assert.ok(Number.isNaN(kept.x), 'a typed invalid value is kept and reported, never silently replaced')

  // ---- RUNTIME: 7 collision with furniture (table top AND chair footprint) -------------------------------------
  assert.equal(v.validateEntrancePlacement(one, { x: 0, z: 0 }).issue, 'blocked_by_furniture', 'inside a tabletop')
  const chair = placement.seatFrameOf(one, 'a', 0)
  assert.equal(v.validateEntrancePlacement(one, { x: chair.x, z: chair.z }).issue, 'blocked_by_furniture', 'inside a chair footprint')
  assert.equal(v.validateEntrancePlacement(one, { x: chair.x + 0.2, z: chair.z }).issue, 'blocked_by_furniture', 'inside the collision margin around a chair')

  // ---- RUNTIME: 8 no navigation start cell ---------------------------------------------------------------------
  const grid = nav.buildNavGrid(one)
  let mismatch = null
  for (let x = -9.75; x <= 9.75 && !mismatch; x += 0.05) {
    for (let z = -7.75; z <= 7.75; z += 0.05) if (grid.pointFree(x, z) && !grid.startCellFree({ x, z })) { mismatch = { x, z }; break }
  }
  assert.ok(mismatch, 'the grid has points that are free but whose A* start cell is blocked')
  assert.deepEqual(v.validateEntranceGeometry(grid, mismatch), { ok: false, issue: 'no_navigation_start' })

  // ---- RUNTIME: 9 unreachable seating (ALL configured seats, never occupancy) ---------------------------------
  const wall = Array.from({ length: 17 }, (_, i) => table(`w${i}`, 5, -8 + i, 2))
  const walled = [table('a', 0, 0), ...wall]
  const behindWall = v.validateEntrancePlacement(walled, { x: 9.25, z: 0 })
  assert.equal(behindWall.ok, false)
  assert.equal(behindWall.issue, 'unreachable_seating')
  for (const seat of ['a#0', 'a#1', 'a#2', 'a#3']) assert.ok(behindWall.unreachable.includes(seat), `${seat} is cut off by the wall of tables`)
  assert.ok(behindWall.tableNumbers.length >= 1, 'the error names the affected visual tables')
  const sameSide = v.validateEntrancePlacement(walled, { x: 0, z: 7.5 })
  assert.ok(!(sameSide.unreachable ?? []).some((seat) => seat.startsWith('a#')), 'the table is reachable from its own side of the wall')
  const jammed = [table('j', 0, 0, 4), table('k', 1.2, 0, 4)]
  assert.equal(v.validateEntrancePlacement(jammed, { x: 0, z: 7.5 }).ok, false, 'a seat boxed in by furniture is rejected even though nobody sits there')

  // ---- RUNTIME: 14 guest navigation regression -----------------------------------------------------------------
  for (const seatIndex of [0, 1, 2, 3]) {
    const plan = route.planArrival(grid, { x: 0, z: 7.5 }, placement.seatFrameOf(one, 'a', seatIndex), -1.6)
    assert.equal(plan.ok, true, `arrival planner still routes seat ${seatIndex} from a perimeter entrance`)
  }
  assert.equal(v.validateEntrancePlacement(one, { x: 0, z: 7.5 }).ok, true, 'all four seats reachable: valid')
  assert.deepEqual(v.suggestEntrance(one), { x: 0, z: -7.5 }, 'first suggestion is the back edge, centred (on screen in the default view, not under the dock)')
  const blockedFront = [table('a', 0, 0), table('f', 0, -7, 2)]
  const suggested = v.suggestEntrance(blockedFront)
  assert.equal(v.validateEntranceGeometry(nav.buildNavGrid(blockedFront), suggested).ok, true, 'suggestion skips furniture (geometry; the jammed edge table is a separate seat-reachability case)')
  assert.notDeepEqual(suggested, { x: 0, z: -7.5 })

  // ---- SOURCE-PATTERN (needs a browser to execute) ------------------------------------------------------------
  const scene = read('src/components/restaurant-3d/RestaurantScene.vue')
  const customers = read('src/components/restaurant-3d/RestaurantCustomers.vue')
  const view = read('src/views/experiments/Restaurant3DView.vue')
  const controller = read('src/components/restaurant-3d/TableEditController.vue')
  // 10 missing entrance fallback
  assert.match(customers, /if \(!entrance \|\| !check\?\.ok\) \{[\s\S]*return spawnSeated\(placement\)/, 'no/invalid entrance: guests simply appear seated')
  assert.match(customers, /!entrance \|\| !check\?\.ok\) \{\s*\n?\s*(void )?/, 'departure also falls back without an entrance')
  // 15 edit vs operational mode
  assert.match(scene, /<EntranceFloorMarker\s+v-if="behavior\.layoutEditing && draftEntrance"/, 'marker only exists in layout edit mode')
  assert.match(scene, /<section\s+v-if="behavior\.layoutEditing"\s+class="editor-dock"[\s\S]*<EntrancePanel/, 'panel lives in the edit-mode dock only')
  assert.match(scene, /:enabled="behavior\.showOperational"\s+:entrance="entrance"/, 'customers read `entrance`')
  assert.match(scene, /const entrance = computed\(\(\) => props\.entrance \?\? savedEntrance\.value\)/, 'operational guests use the persisted entrance, never the draft')
  // dirty / save gating, revalidation right before save
  assert.match(scene, /runEntranceCheck\(\)\s+if \(entranceBlocking\.value\) return/, 'save re-validates the entrance and refuses an invalid one')
  assert.match(scene, /!entranceBlocking\.value/, 'Save is disabled while the entrance is invalid')
  assert.match(scene, /sent: sent\.entrance/, 'a confirmed save rebases the entrance baseline')
  assert.match(scene, /:orbit-enabled="!draggingTable && !draggingEntrance"/, 'camera does not orbit while the entrance is dragged')
  // validation never runs per pointer move
  assert.match(scene, /if \(draggingTable\.value \|\| draggingEntrance\.value\) return/, 'validation is skipped while dragging')
  // drag handling stops OrbitControls and validates on release
  assert.match(controller, /event\.stopPropagation\(\)\s+emit\('selectEntrance'\)/)
  assert.match(controller, /emit\('entranceDragging', false\)\s+emit\('dropEntrance'\)/, 'placement validated on release')
  // 11/12 switching + conflicts: entrance edits are part of the same dirty flag the conflict guard uses
  assert.match(view, /else if \(action === 'conflict'\) markStale\(\)/, 'external layout update with an unsaved entrance is a conflict, not a reload')
  assert.match(scene, /watch\(isDirty, \(dirty\) => emit\('dirtyChange', dirty\)/, 'entrance edits reach the conflict guard through isDirty')
  assert.match(view, /:key="`\$\{restaurantId\}-\$\{revision\}`"/, 'restaurant switch remounts the scene (fresh draft, selection and validation)')

  // locales
  for (const locale of ['es-ES', 'en-GB', 'ca-ES-valencia']) {
    const text = read(`src/i18n/locales/${locale}.ts`)
    for (const key of ['configure:', 'invalid_coordinates:', 'outside_floor:', 'blocked_by_furniture:', 'no_navigation_start:', 'unreachable_seating:', 'saveBlocked:', 'placeHint:']) {
      assert.ok(text.includes(key), `${locale} has entrance.${key}`)
    }
  }
  assert.equal(read('src/i18n/locales/es-ES.ts').includes("label: 'Entrada'"), true)

  console.log('frontend entrance checks passed')
} finally {
  await server.close()
}
