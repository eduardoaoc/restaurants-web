import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [shell, service, feedback, staff, staffForm, kitchen, close, menu, categories, tables, canvas, overlay] = await Promise.all([
  read('src/layouts/AppShellLayout.vue'),
  read('src/views/service/ServiceView.vue'),
  read('src/views/feedback/FeedbackView.vue'),
  read('src/views/staff/StaffView.vue'),
  read('src/components/staff/StaffForm.vue'),
  read('src/views/kitchen/KitchenView.vue'),
  read('src/views/day-close/DayCloseView.vue'),
  read('src/views/menu/MenuView.vue'),
  read('src/components/menu/CategoryList.vue'),
  read('src/views/tables/TablesView.vue'),
  read('src/components/tables/FloorPlanCanvas.vue'),
  read('src/components/ui/AOverlay.vue'),
])

assert.match(shell, /AAppShell/, 'all authenticated routes keep the shared shell')
assert.match(service, /grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2/, 'service actions wrap into a responsive grid')
assert.doesNotMatch(service, /overflow-x-auto pb-1 snap-x/, 'service pending actions do not scroll horizontally')
assert.match(service, /<details v-if="canChangeAvailability"/, 'product availability is collapsible')
assert.match(feedback, /md:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(0,1fr\)_auto\]/, 'feedback fields align into responsive columns')

assert.match(staff, /aspect-square/, 'team members use square cards')
assert.match(staff, /<ADialog[\s\S]*:before-close="beforeStaffClose"/, 'the selected team profile opens in a guarded dialog')
assert.match(staff, /size="lg"/, 'the profile dialog has room for its existing details and actions')
assert.doesNotMatch(staff, /lg:grid-cols-\[minmax\(0,1fr\)_400px\]/, 'team details are no longer rendered in a side panel')
assert.match(staff, /staffForm\.value\?\.isDirty/, 'dirty profile forms are protected on close')
assert.match(staffForm, /defineExpose\(\{ isDirty \}\)/, 'profile form exposes its local draft state to the modal guard')
assert.match(overlay, /aria-modal="modal \|\| undefined"/, 'the shared dialog provides modal semantics')
assert.match(overlay, /useOverlayFocus/, 'the shared dialog manages initial, trapped and restored focus')

assert.match(kitchen, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'desktop kitchen board fits its four real states without horizontal scrolling')
assert.match(kitchen, /\.kds-column-list \{[^}]*overflow-y: auto/s, 'each kitchen state scrolls independently')
assert.match(kitchen, /\.kds-column-heading \{[^}]*position: sticky/s, 'kitchen state headings remain visible')
assert.match(kitchen, /@media \(max-width: 1023px\)/, 'narrow screens switch to status filters')
assert.match(kitchen, /\.kds-columns \{ display: none; \}/, 'compact state navigation avoids a duplicate visible board')

assert.match(close, /\.day-close-layout \{ grid-template-columns: minmax\(0, 1\.15fr\) minmax\(20rem, \.85fr\)/, 'desktop places cash count beside review context')
assert.match(close, /:disabled="!canSubmitClose"/, 'existing close blockers still disable submission')
assert.match(categories, /menu-category-workspace/, 'category and selected product work areas are grouped')
assert.match(categories, /grid-template-columns: minmax\(12rem, 0\.32fr\) minmax\(0, 1fr\)/, 'desktop menu places categories left and products right')
assert.match(tables, /<FloorPlanCanvas/, 'table editor retains its real interactive floor canvas')
assert.match(tables, /:movable="canManageFloorPlan"/, 'table movement remains permission-gated')
assert.match(canvas, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown/, 'floor canvas retains keyboard movement')

console.log('PASS: shared shell, responsive page structures, profile modal/focus/dirty guard, independent kitchen scroll, close blockers, menu layout and keyboard floor movement')
