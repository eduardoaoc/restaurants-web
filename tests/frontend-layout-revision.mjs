import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

/**
 * Phase 3.1H-D frontend. RUNTIME: reconcile decisions, the service's expected_revision / 409 contract (through a fake
 * transport), the editable draft. SOURCE-PATTERN: Vue wiring that needs a browser to execute.
 */
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const read = (p) => readFileSync(p, 'utf8')
try {
  const { decideLayoutReconcile } = await server.ssrLoadModule('/src/components/restaurant-3d/layout-revision.ts')
  const { floorLayoutService, FloorLayoutConflictError } = await server.ssrLoadModule('/src/services/floor-layout.service.ts')
  const { http } = await server.ssrLoadModule('/src/api/http.ts')
  const { cameraFit } = await server.ssrLoadModule('/src/components/restaurant-3d/camera-fit.ts')

  // ---- RUNTIME: reconcile decisions ---------------------------------------------------------------------------
  const d = (o) => decideLayoutReconcile({ remoteRevision: 3, confirmedRevision: 3, dirty: false, saving: false, ...o })
  assert.equal(d({}), 'ignore', 'same revision: own echo or an unrelated 2D event')
  assert.equal(d({ dirty: true }), 'ignore', 'same revision with a draft: nothing changed remotely')
  assert.equal(d({ remoteRevision: 4 }), 'reload', 'newer remote and no draft: safe to reload')
  assert.equal(d({ remoteRevision: 4, dirty: true }), 'conflict', 'newer remote and unsaved edits: conflict, draft kept')
  assert.equal(d({ remoteRevision: 4, saving: true }), 'defer', 'during a save the event is looked at later, never assumed to be an echo')
  assert.equal(d({ remoteRevision: 3, saving: true }), 'defer')

  // ---- RUNTIME: service contract through a fake transport -----------------------------------------------------
  const calls = []
  const payload = (revision) => ({ data: { data: { floor_layout: { version: 1, revision, floor: { width: 20, depth: 16, gridStep: 0.25 }, entrance: null, tables: [] } } } })
  let next
  http.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined })
    if (next instanceof Error) throw next
    return { ...next, status: 200, statusText: 'OK', headers: {}, config }
  }
  next = payload(7)
  const loaded = await floorLayoutService.get(1)
  assert.equal(loaded.revision, 7, 'GET exposes the server revision')
  const doc = { version: 1, revision: 7, floor: { width: 20, depth: 16, gridStep: 0.25 }, tables: [] }
  next = payload(8)
  const saved = await floorLayoutService.replace(1, doc, 7)
  assert.equal(saved.revision, 8, 'the save response carries the new revision')
  const put = calls.at(-1)
  assert.equal(put.method, 'put')
  assert.equal(put.body.expected_revision, 7, 'save sends expected_revision')
  assert.equal('revision' in put.body, false, 'the client never claims a revision in the document body')

  next = Object.assign(new Error('Request failed'), { response: { status: 409, data: { code: 'floor_layout_revision_conflict', data: { current_revision: 9 } } } })
  await assert.rejects(() => floorLayoutService.replace(1, doc, 7), (e) => e instanceof FloorLayoutConflictError && e.currentRevision === 9, '409 is a typed conflict')
  next = Object.assign(new Error('boom'), { response: { status: 409, data: { message: 'some other 409' } } })
  await assert.rejects(() => floorLayoutService.replace(1, doc, 7), (e) => !(e instanceof FloorLayoutConflictError), 'only the revision conflict is typed as such')
  next = Object.assign(new Error('boom'), { response: { status: 422, data: {} } })
  await assert.rejects(() => floorLayoutService.replace(1, doc, 7), (e) => !(e instanceof FloorLayoutConflictError))

  // ---- RUNTIME: camera fit ------------------------------------------------------------------------------------
  assert.equal(cameraFit(2), 1)
  assert.ok(cameraFit(0.6) > 1.5 && cameraFit(0.6) <= 2.1)
  assert.equal(cameraFit(NaN), 1)
  assert.ok(cameraFit(0.3) <= 2.1, 'capped')

  // ---- SOURCE-PATTERN (no browser) ----------------------------------------------------------------------------
  const view = read('src/views/experiments/Restaurant3DView.vue')
  const scene = read('src/components/restaurant-3d/RestaurantScene.vue')
  const rig = read('src/components/restaurant-3d/CameraRig.vue')
  assert.match(view, /floorLayoutService\.replace\(id, document, confirmedRevision\.value\)/, 'view saves against the confirmed revision')
  assert.match(view, /confirmedRevision\.value = saved\.revision/, 'confirmed revision follows a successful save')
  assert.match(view, /watch\(layout, value => \{ if \(value\) confirmedRevision\.value = value\.revision \?\? 0 \}\)/, 'revision is taken from every load')
  assert.match(view, /cause instanceof FloorLayoutConflictError[\s\S]*markStale\(\)/, '409 marks the draft stale')
  assert.match(view, /:save-blocked="staleDraft"/, 'saving is blocked while the draft is stale')
  assert.match(view, /const keepLocalDraft = \(\) => \{ conflictUnacknowledged\.value = false \}/, '"keep" only acknowledges; it does not clear staleDraft (no bypass)')
  assert.doesNotMatch(view, /keepLocalDraft = \(\) => \{[^}]*staleDraft\.value = false/, 'keeping the draft never unblocks saving')
  assert.match(view, /if \(action === 'defer'\) pendingReconcile = true/, 'events during a save are deferred, not dropped')
  assert.match(view, /watch\(editorSaving, saving => \{\s*if \(!saving && pendingReconcile\)/, 'deferred reconcile runs when the save settles')
  assert.match(view, /watch\(restaurantId, \(\) => \{[\s\S]*reconcileGeneration\+\+/, 'restaurant switch invalidates in-flight reconciles')
  assert.match(view, /if \(generation !== reconcileGeneration \|\| id !== restaurantId\.value\) return/, 'a late peek for another restaurant is ignored')
  assert.doesNotMatch(view, /else if \(!editorSaving\.value\) await reload\(\)/, 'the old "any event during save is an echo" shortcut is gone')
  assert.match(scene, /cause instanceof FloorLayoutConflictError[\s\S]*floorLayout\.conflict\.saveRefused/, 'the scene explains a refused save and keeps the draft')
  assert.match(rig, /userMovedCamera = true/, 'a user-moved camera is never auto-refit')
  assert.match(rig, /if \(!cam \|\| !ctl \|\| userMovedCamera \|\| props\.focus/, 'refit skipped after user movement or while a table is focused')
  assert.match(rig, /setTimeout\(refit, 150\)/, 'refit is debounced')
  for (const locale of ['es-ES', 'en-GB', 'ca-ES-valencia']) {
    const t = read(`src/i18n/locales/${locale}.ts`)
    assert.ok(t.includes('keptMessage:') && t.includes('saveRefused:'), `${locale} conflict copy`)
  }

  console.log('frontend layout revision checks passed')
} finally {
  await server.close()
}
