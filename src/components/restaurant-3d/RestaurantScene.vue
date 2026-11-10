<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useI18n } from 'vue-i18n'
import { normalizeApiError } from '@/api/errors'
import { useSnackbar } from '@/composables/useSnackbar'
import { describeApiError } from '@/utils/error-message'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import { mockLayout } from '@/data/restaurant-3d/mock-layout'
import { mockEvents } from '@/data/restaurant-3d/mock-events'
import { mockOperationalState } from '@/data/restaurant-3d/mock-operational-state'
import type { FloorPosition, RestaurantLayout, RestaurantLayoutDocument } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'
import CameraRig from './CameraRig.vue'
import AddTablePanel from './AddTablePanel.vue'
import EditorToolbar from './EditorToolbar.vue'
import RestaurantCustomers, { type CustomerStats, type NavDebugOptions } from './RestaurantCustomers.vue'
import RestaurantTable from './RestaurantTable.vue'
import TableEditController from './TableEditController.vue'
import { LAB_CURRENCY, toOperationsTable } from './table-detail-adapter'
import { FLOOR } from './floor'
import { type EditResult } from './use-editable-layout'
import { type TableDraft, validateLayout } from './editor-validation'
import { minSeatsForState, resolveTableState } from './table-operational-state'
import { installLabApiGuard } from './lab-api-guard'
import { selectTopEventPerTarget } from './operational-events'
import { validateOperationalState } from './operational-validation'
import { SCENE_MODE_BEHAVIOR, type RestaurantSceneMode } from './scene-mode'
import { useEditableLayout } from './use-editable-layout'
import { useSceneClock } from './use-scene-clock'

const props = withDefaults(defineProps<{
  mode?: RestaurantSceneMode
  /** Layout to edit/show. Read once on mount: re-key the component to load another. */
  layout?: RestaurantLayout
  /**
   * Persists a layout document and resolves with the canonical one the server
   * stored. Without it the scene is not persistable and shows no save action.
   */
  save?: (document: RestaurantLayoutDocument) => Promise<RestaurantLayoutDocument>
  /**
   * Recorded operational state (guests, status). Read once on mount like `layout`. Defaults to the
   * mock; the dev fixture view passes generated guest counts to exercise 1/5/10/20 customers.
   */
  operationalState?: RestaurantOperationalState
  /**
   * Where customers walk in and out (floor metres). Absent = no arrival/departure animation: guests just
   * appear seated / vanish, exactly as before. The restaurant's real entrance is not part of the layout contract yet.
   */
  entrance?: FloorPosition | null
  /** DEV only: navigation overlays (paths / obstacles). Nothing is drawn when absent. */
  navDebug?: NavDebugOptions
}>(), { mode: 'operation', layout: () => mockLayout, save: undefined, operationalState: () => mockOperationalState, entrance: null, navDebug: undefined })
const emit = defineEmits<{
  tableSelected: [tableId: string | null]
  entranceStatus: [value: { ok: boolean; reason?: string }]
  navFailure: [message: string]
  stats: [value: CustomerStats]
}>()
const behavior = computed(() => SCENE_MODE_BEHAVIOR[props.mode])
// Persisted entrance is configuration only; no entrance is inferred for old layouts.
const entrance = props.entrance ?? props.layout?.entrance ?? null

// Both modes read the same editable in-memory copy, so edits survive a mode switch.
const source: RestaurantLayout = props.layout
// Recorded state exists only for the mock's own tables; every other table resolves to "available".
const operationalState: RestaurantOperationalState = props.operationalState
const stateOf = (tableId: string) => resolveTableState(operationalState, tableId)
const { tables, isDirty, markSaved, toDocument, tableById, moveTable, rotateTable, addTable, duplicateTable, removeTable, updateTable } =
  useEditableLayout(source, { minSeatsFor: (tableId) => minSeatsForState(operationalState, tableId) })

// Animated customers replace the placeholder guest bodies; if their assets cannot load, fall back to the placeholders.
const customersFailed = ref(false)
const hiddenChairs = ref<Record<string, number[]>>({})
const customerStats = ref<CustomerStats | null>(null)

// One badge per target for this POC: its highest-priority event.
const topEvents = selectTopEventPerTarget(mockEvents)
// The one clock for the scene: drives badge wait times and the table labels.
const now = useSceneClock()

// --- Table selection -------------------------------------------------------
const selectedTableId = ref<string | null>(null)
const selectedConfig = computed(() => (selectedTableId.value ? tableById(selectedTableId.value) ?? null : null))
const focus = computed(() => selectedConfig.value
  ? { x: selectedConfig.value.position.x, z: selectedConfig.value.position.z }
  : null)
// The real drawer wants the backend's table shape; the adapter builds it from lab data.
const selectedOperationsTable = computed(() => selectedConfig.value
  ? toOperationsTable(selectedConfig.value, stateOf(selectedConfig.value.id), now.value)
  : null)

// A click is a press and release with (almost) no pointer travel; an orbit
// drag moves the pointer, so it never opens a table. The press is tracked here
// on the wrapper (capture) because OrbitControls swallows pointerdown on the canvas.
const CLICK_MOVE_TOLERANCE_PX = 6
let pressedAt: { x: number; y: number } | null = null

function onPress(event: PointerEvent): void {
  pressedAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
}

function onTableSelect(tableId: string, release: { x: number; y: number }): void {
  if (!behavior.value.operationalSelection) return
  const pressed = pressedAt
  pressedAt = null
  if (!pressed || Math.hypot(release.x - pressed.x, release.y - pressed.y) > CLICK_MOVE_TOLERANCE_PX) return
  selectedTableId.value = tableId
}

function clearSelection(): void {
  selectedTableId.value = null
}

// --- Saving ------------------------------------------------------------------
// One request at a time. A failure leaves the working copy and the dirty flag
// untouched; a success rebases the baseline without touching newer edits.
const { t } = useI18n()
const snackbar = useSnackbar()
const saving = ref(false)
const canSave = computed(() => props.save !== undefined && isDirty.value && !saving.value)

async function onSave(): Promise<void> {
  if (!props.save || !canSave.value) return
  const sent = toDocument()
  saving.value = true
  try {
    const canonical = await props.save(sent)
    markSaved(canonical.tables, sent.tables)
    snackbar.showSnackbar({ message: t('floorLayout.saved'), kind: 'success' })
  } catch (cause) {
    snackbar.showSnackbar({ message: describeApiError(normalizeApiError(cause), t), kind: 'danger', duration: 8000 })
  } finally {
    saving.value = false
  }
}

// --- Layout editing ---------------------------------------------------------
// Edit mode keeps its own selection: no camera focus, no detail sheet.
const editSelectedId = ref<string | null>(null)
const editSelectedTable = computed(() => (editSelectedId.value ? tableById(editSelectedId.value) ?? null : null))
const draggingTable = ref(false)
const addPanelOpen = ref(false)
const addError = ref<string | null>(null)
const editError = ref<string | null>(null)

const firstMessage = (result: EditResult): string | null => (result.ok ? null : result.issues[0]?.message ?? null)

function openAddPanel(): void {
  editSelectedId.value = null
  addError.value = null
  addPanelOpen.value = true
}

function onAddTable(draft: TableDraft): void {
  const result = addTable(draft)
  addError.value = firstMessage(result)
  if (result.ok) {
    addPanelOpen.value = false
    editSelectedId.value = result.table.id
  }
}

function onUpdateTable(patch: Partial<TableDraft>): void {
  if (!editSelectedId.value) return
  editError.value = firstMessage(updateTable(editSelectedId.value, patch))
}

function onDuplicateTable(): void {
  if (!editSelectedId.value) return
  const result = duplicateTable(editSelectedId.value)
  editError.value = firstMessage(result)
  if (result.ok) editSelectedId.value = result.table.id
}

function onRemoveTable(): void {
  if (!editSelectedId.value) return
  removeTable(editSelectedId.value)
  editSelectedId.value = null
}

// A different selection starts without the previous table's message or an open add panel.
watch(selectedTableId, (id) => emit('tableSelected', id))

watch(editSelectedId, (id) => {
  editError.value = null
  if (id) addPanelOpen.value = false
})

// Changing mode starts clean: closes the sheet (camera eases back) and drops the editor selection.
watch(() => props.mode, () => {
  selectedTableId.value = null
  editSelectedId.value = null
  draggingTable.value = false
  addPanelOpen.value = false
})

// The reused drawer talks to the real API layer; keep lab tables off the network.
let removeApiGuard: (() => void) | undefined
onMounted(() => {
  removeApiGuard = installLabApiGuard()
})
// DEV only: edit the layout while customers are moving (the UI cannot: editing cancels movement first).
if (import.meta.env.DEV) {
  ;(window as unknown as { __floorEdit?: unknown }).__floorEdit = {
    removeTable: (id: string) => removeTable(id),
    rotateTable: (id: string, direction: 1 | -1 = 1) => rotateTable(id, direction),
    tables: () => tables.value.map((t) => ({ id: t.id, rotation: t.rotation, x: t.position.x, z: t.position.z })),
  }
}
onBeforeUnmount(() => {
  if (import.meta.env.DEV) delete (window as unknown as { __floorEdit?: unknown }).__floorEdit
  removeApiGuard?.()
})

if (import.meta.env.DEV) {
  for (const problem of validateLayout(source)) {
    console.warn(`[restaurant-3d] ${problem}`)
  }
  // The recorded mock state/events only describe the mock layout's tables.
  if (source === mockLayout) {
    for (const problem of validateOperationalState(source, operationalState, mockEvents)) {
      console.warn(`[restaurant-3d] ${problem}`)
    }
  }
}

// Three-quarter view from above, aimed at the middle of the table layout.
const cameraPosition: [number, number, number] = [8, 12, 12.5]
</script>

<template>
  <div
    class="restaurant-scene"
    @pointerdown.capture="onPress"
  >
    <TresCanvas
      clear-color="#151515"
      shadows
    >
      <!-- Câmera inicial estilo isométrico -->
      <TresPerspectiveCamera
        :position="cameraPosition"
        :look-at="[0.8, 0.4, 0]"
        :fov="35"
        :near="0.1"
        :far="1000"
      />

      <!-- Iluminação ambiente -->
      <TresHemisphereLight
        :args="['#fff4e6', '#5a4632', 1.2]"
      />

      <!-- Luz principal -->
      <TresDirectionalLight
        :position="[8, 14, 6]"
        :intensity="2.5"
        color="#fff0d8"
        cast-shadow
        :shadow-mapSize-width="2048"
        :shadow-mapSize-height="2048"
        :shadow-camera-left="-FLOOR.width / 2"
        :shadow-camera-right="FLOOR.width / 2"
        :shadow-camera-top="FLOOR.width / 2"
        :shadow-camera-bottom="-FLOOR.width / 2"
        :shadow-camera-near="1"
        :shadow-camera-far="40"
        :shadow-bias="-0.0005"
      />

      <!-- Piso provisório -->
      <TresMesh
        :position="[0, -0.01, 0]"
        :rotation="[-Math.PI / 2, 0, 0]"
        receive-shadow
      >
        <TresPlaneGeometry :args="[FLOOR.width, FLOOR.depth]" />

        <TresMeshStandardMaterial
          color="#8b5a32"
          :roughness="0.8"
        />
      </TresMesh>

      <!-- Mesas e cadeiras a partir do layout -->
      <RestaurantTable
        v-for="table in tables"
        :key="table.id"
        :table="table"
        :state="stateOf(table.id)"
        :events="topEvents"
        :now="now"
        :selected="behavior.layoutEditing ? table.id === editSelectedId : table.id === selectedTableId"
        :show-operational="behavior.showOperational"
        :guest-bodies="customersFailed"
        :hidden-chairs="hiddenChairs[table.id]"
        @select="onTableSelect"
      />

      <!-- Seated customers: one per explicit guest record; hidden while the layout is being edited. -->
      <RestaurantCustomers
        :tables="tables"
        :states="operationalState"
        :enabled="behavior.showOperational"
        :entrance="entrance"
        :debug="navDebug"
        @stats="customerStats = $event; emit('stats', $event)"
        @failed="customersFailed = true"
        @chairs-hidden="hiddenChairs = $event"
        @entrance="emit('entranceStatus', $event)"
        @nav-failure="emit('navFailure', $event)"
      />

      <TableEditController
        :enabled="behavior.layoutEditing"
        :tables="tables"
        @select="editSelectedId = $event"
        @move="moveTable"
        @dragging="draggingTable = $event"
      />

      <CameraRig
        :focus="focus"
        :orbit-enabled="!draggingTable"
      />
    </TresCanvas>

    <dl
      v-if="customerStats && behavior.showOperational"
      class="dev-stats"
      data-dev-stats
    >
      <div><dt>Customers</dt><dd data-stat="customers">{{ customerStats.customers }}</dd></div>
      <div><dt>Chairs moving</dt><dd data-stat="chairs">{{ customerStats.chairs }}</dd></div>
      <div><dt>Arrivals</dt><dd data-stat="arrivals">{{ customerStats.arrivals }}</dd></div>
      <div><dt>Departures</dt><dd data-stat="departures">{{ customerStats.departures }}</dd></div>
      <div><dt>Nav failures</dt><dd data-stat="navFailures">{{ customerStats.navFailures }}</dd></div>
      <div><dt>Path objects</dt><dd data-stat="pathObjects">{{ customerStats.pathObjects }}</dd></div>
      <div><dt>Mixers/frame</dt><dd data-stat="mixers">{{ customerStats.mixers }}</dd></div>
      <div><dt>Anim CPU</dt><dd data-stat="animMs">{{ customerStats.animMs }} ms</dd></div>
      <div><dt>Chair CPU</dt><dd data-stat="chairMs">{{ customerStats.chairMs }} ms</dd></div>
      <div><dt>Draw calls</dt><dd data-stat="calls">{{ customerStats.calls }}</dd></div>
      <div><dt>Triangles</dt><dd data-stat="triangles">{{ customerStats.triangles }}</dd></div>
      <div><dt>Geometries</dt><dd data-stat="geometries">{{ customerStats.geometries }}</dd></div>
      <div><dt>Textures</dt><dd data-stat="textures">{{ customerStats.textures }}</dd></div>
      <div><dt>FPS</dt><dd data-stat="fps">{{ customerStats.fps }}</dd></div>
    </dl>

    <div
      class="editor-overlay"
      data-editor-ui
    >
      <button
        v-if="behavior.layoutEditing && !addPanelOpen"
        type="button"
        class="editor-add"
        @click="openAddPanel"
      >
        + Agregar mesa
      </button>
      <AddTablePanel
        v-if="behavior.layoutEditing && addPanelOpen"
        :tables="tables"
        :error="addError"
        @create="onAddTable"
        @cancel="addPanelOpen = false"
      />
      <div
        v-if="isDirty || (behavior.layoutEditing && save)"
        class="editor-save"
      >
        <span
          v-if="isDirty"
          class="editor-dirty"
          role="status"
        >Cambios sin guardar</span>
        <button
          v-if="behavior.layoutEditing && save"
          type="button"
          class="editor-add editor-save__button"
          :disabled="!canSave"
          :aria-busy="saving"
          @click="onSave"
        >
          {{ saving ? t('floorLayout.saving') : t('floorLayout.save') }}
        </button>
      </div>
      <EditorToolbar
        v-if="behavior.layoutEditing && editSelectedTable"
        :table="editSelectedTable"
        :error="editError"
        @rotate="rotateTable(editSelectedTable.id, $event)"
        @update="onUpdateTable"
        @duplicate="onDuplicateTable"
        @remove="onRemoveTable"
      />
    </div>

    <!-- The application's own table-detail sheet, not a lab copy. -->
    <TableDetailsDrawer
      :table="selectedOperationsTable"
      :staff="[]"
      :free-tables="[]"
      :currency="LAB_CURRENCY"
      dashboard-mode
      @close="clearSelection"
      @refresh="() => {}"
    />
  </div>
</template>

<style scoped>
/* Development only: customer rendering statistics (the component only emits them in dev builds). */
.dev-stats {
  position: absolute;
  inset: 12px auto auto 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 4px 10px;
  width: min(560px, calc(100% - 24px));
  margin: 0;
  padding: 8px 12px;
  border: 1px solid #343434;
  border-radius: 12px;
  background: rgb(15 15 16 / 0.72);
  font-size: 10px;
  pointer-events: none;
}

.dev-stats dt { white-space: nowrap; }
.dev-stats dt { opacity: 0.6; }
.dev-stats dd { margin: 0; font-variant-numeric: tabular-nums; }

.editor-overlay {
  position: absolute;
  inset: auto 16px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
}

.editor-overlay > * {
  pointer-events: auto;
}

.editor-add {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid #343434;
  border-radius: 12px;
  background: rgb(23 24 28 / 0.92);
  color: #f2eae3;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.editor-save {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-save__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.editor-add:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}

.editor-dirty {
  padding: 4px 10px;
  border: 1px solid #343434;
  border-radius: 999px;
  background: rgb(23 24 28 / 0.85);
  color: #f2eae3;
  font-size: 12px;
}

.restaurant-scene {
  position: relative;
  width: 100%;
  height: 720px;
  overflow: hidden;
  background: #151515;
}
</style>
