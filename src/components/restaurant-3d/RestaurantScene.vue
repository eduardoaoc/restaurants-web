<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { ACESFilmicToneMapping, NeutralToneMapping } from 'three'
import { useI18n } from 'vue-i18n'
import { normalizeApiError } from '@/api/errors'
import { useSnackbar } from '@/composables/useSnackbar'
import { describeApiError } from '@/utils/error-message'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import { mockLayout } from '@/data/restaurant-3d/mock-layout'
import { mockEvents } from '@/data/restaurant-3d/mock-events'
import { mockOperationalState } from '@/data/restaurant-3d/mock-operational-state'
import type { FloorPosition, RestaurantLayout, RestaurantLayoutDocument, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'
import type { OperationsLiveSnapshot, OperationsTable } from '@/types/operations'
import type { OperationalEvent } from '@/types/restaurant-3d/operational-event'
import CameraRig from './CameraRig.vue'
import { SCENE_FAILURE_KEY } from './scene-runtime-guard'
import { sceneCommands } from './scene-commands'
import AddTablePanel from './AddTablePanel.vue'
import EditorToolbar from './EditorToolbar.vue'
import EntranceFloorMarker from './EntranceFloorMarker.vue'
import EntrancePanel from './EntrancePanel.vue'
import { frameRestaurant, ultimateDirection } from './framing'
import { chooseQuality, detectDeviceHints } from './graphics-quality'
import { snapToGrid } from './layout-editing'
import { entranceLimits, suggestEntrance, validateEntrancePlacement, type EntranceValidation } from './entrance-validation'
import RestaurantCustomers, { type CustomerStats, type NavDebugOptions } from './RestaurantCustomers.vue'
import ChairInstances from './ChairInstances.vue'
import RestaurantTable from './RestaurantTable.vue'
import RestaurantEnvironment from './RestaurantEnvironment.vue'
import UltimateEnvironment from './UltimateEnvironment.vue'
import UrbanExterior from './UrbanExterior.vue'
import { contextPoints, planUrban, terraceContextPoints } from './urban-plan'
import { WORLD_FOG } from './camera-limits'
import ModularFloor from './ModularFloor.vue'
import TableEditController from './TableEditController.vue'
import { LAB_CURRENCY, toOperationsTable } from './table-detail-adapter'
import { FLOOR } from './floor'
import { type EditResult } from './use-editable-layout'
import { type TableDraft, validateLayout } from './editor-validation'
import { minSeatsForState, resolveTableState } from './table-operational-state'
import { installLabApiGuard } from './lab-api-guard'
import { selectTopEventPerTarget } from './operational-events'
import { validateOperationalState } from './operational-validation'
import { mapOperationsFloor } from './operations-floor-mapper'
import { FloorLayoutConflictError } from '@/services/floor-layout.service'
import { SCENE_MODE_BEHAVIOR, type RestaurantSceneMode } from './scene-mode'
import { useEditableLayout } from './use-editable-layout'
import { useSceneClock } from './use-scene-clock'
import { LIGHT_STAGE, sceneAppearance } from './scene-appearance'
import { minSeatsForBackendTable, tableMappingState, validateCapacityAgainstOccupancy, validateTableMappings, type ActiveGuestCounts, type BackendTableOption } from './table-mapping'

// Present only when a host wraps the scene in SceneRuntimeGuard (the Dashboard); the fixture and the editor have none.
const reportSceneFailure = inject(SCENE_FAILURE_KEY, null)
const props = withDefaults(defineProps<{
  mode?: RestaurantSceneMode
  /** Layout to edit/show. Read once on mount: re-key the component to load another. */
  layout?: RestaurantLayout
  /**
   * Persists a layout document and resolves with the canonical one the server
   * stored. Without it the scene is not persistable and shows no save action.
   */
  save?: (document: RestaurantLayoutDocument) => Promise<RestaurantLayoutDocument>
  /** Explicit fixture state. Production state comes from Operations Live below. */
  operationalState?: RestaurantOperationalState
  /** Authoritative, restaurant-scoped production snapshot; remains reactive across refreshes. */
  operationsSnapshot?: OperationsLiveSnapshot | null
  restaurantId?: number | null
  /** Current-restaurant catalog, provided by the authenticated tables API. */
  backendTables?: readonly BackendTableOption[]
  mappingLoading?: boolean
  mappingLoadError?: string | null
  /** Blocks saving (e.g. an unresolved external layout change). The draft itself is never touched. */
  saveBlocked?: boolean
  /** Real mode supplies an empty list; mock event badges are fixture-only. */
  operationalEvents?: OperationalEvent[]
  /**
   * Where customers walk in and out (floor metres). Absent = no arrival/departure animation: guests just
   * appear seated / vanish, exactly as before. The restaurant's real entrance is not part of the layout contract yet.
   */
  entrance?: FloorPosition | null
  /** DEV only: navigation overlays (paths / obstacles). Nothing is drawn when absent. */
  navDebug?: NavDebugOptions
  /**
   * Room architecture. `kaykit` is the production envelope; `ultimate` is the local-demo Ultimate Pack architecture
   * (LICENSE_UNVERIFIED) with its own light / exposure setup. Only the dev fixture selects `ultimate`.
   */
  environment?: 'kaykit' | 'ultimate'
  /** DEV before/after review of the Ultimate finish: `raw` = same geometry with unfinished materials and the old light. */
  finish?: 'final' | 'raw'
  /** Ultimate demo only: frame the whole architecture (also on phones, where the default frames the tables). Each change re-frames. */
  overview?: boolean
  /** Dev stats panel over the canvas; off for clean visual review. */
  diagnostics?: boolean
  /** When supplied, the host owns the selection and shows its own details. */
  selectedLayoutTableId?: string | null
  /**
   * Dashboard stage: the scene is the page's background, so it fills its container, uses the light neutral maquette
   * look, frames the whole room (floor, walls, terrace) and never zooms into a selected table — the host's panels
   * show the details while the room stays visible and interactive.
   */
  stage?: boolean
}>(), { stage: false, mode: 'operation', layout: () => mockLayout, save: undefined, entrance: null, navDebug: undefined, environment: 'kaykit', finish: 'final', overview: false, diagnostics: true })
const { t } = useI18n()
const emit = defineEmits<{
  tableSelected: [tableId: string | null]
  entranceStatus: [value: { ok: boolean; reason?: string }]
  navFailure: [message: string]
  stats: [value: CustomerStats]
  refreshOperationalData: []
  dirtyChange: [dirty: boolean]
  savingChange: [saving: boolean]
}>()
/** Final Ultimate finish (light, exposure, soft shadows). The kaykit scene and the `raw` baseline keep the original setup. */
watch(() => props.stage, stage => { sceneAppearance.light = stage }, { immediate: true })
onBeforeUnmount(() => { sceneAppearance.light = false })
const ultimateFinal = computed(() => props.environment === 'ultimate' && props.finish === 'final')
const behavior = computed(() => SCENE_MODE_BEHAVIOR[props.mode])
// Persisted entrance is configuration only; no entrance is inferred for old layouts.

// Both modes read the same editable in-memory copy, so edits survive a mode switch.
const source: RestaurantLayout = props.layout
const { tables, entrance: draftEntrance, savedEntrance, setEntrance, setTablePosition, savedTables, isDirty, markSaved, discard, toDocument, tableById, moveTable, rotateTable, addTable, duplicateTable, removeTable, updateTable, setBackendTable } =
  useEditableLayout(source, {
    // Seat-index floor from the rendered guests, raised by the authoritative guest count of the table the DRAFT links to.
    minSeatsFor: (tableId) => Math.max(
      minSeatsForState(operationalState.value, tableId),
      minSeatsForBackendTable(tableById(tableId) ?? { backendTableId: undefined } as RestaurantTableConfig, activeGuestCounts.value),
    ),
  })
// Guests walk in through the last PERSISTED entrance (dev override aside). The draft only drives the editor preview, so an
// unsaved or invalid draft is never exposed to operations; it becomes operational only after a confirmed save.
const entrance = computed(() => props.entrance ?? savedEntrance.value)
// Urban exterior (Ultimate demo only): the street, sidewalk and terrace follow the configured entrance's wall.
const urban = computed(() => (props.environment === 'ultimate' ? planUrban(entrance.value) : null))
/** Default camera position: the reference view that decides which tree spots hide a guest. */
const coverEye = computed(() => (urban.value ? { x: initialFrame.position[0], y: initialFrame.position[1], z: initialFrame.position[2] } : null))
const urbanContext = computed(() => (urban.value ? contextPoints(urban.value) : undefined))
const urbanCompactContext = computed(() => (urban.value ? terraceContextPoints(urban.value) : undefined))
const savedLayout = computed<RestaurantLayout>(() => ({ ...source, tables: savedTables.value }))
// Production occupancy is projected from Operations Live. The mock state is only
// available when the mock layout is used by the development lab/fixture.
const floorMapping = computed(() => props.operationsSnapshot && props.restaurantId != null
  ? mapOperationsFloor(savedLayout.value, props.operationsSnapshot, props.restaurantId)
  : null)
const operationalState = computed<RestaurantOperationalState>(() => props.operationalState
  ?? floorMapping.value?.state
  ?? (source === mockLayout ? mockOperationalState : {}))
const stateOf = (tableId: string) => resolveTableState(operationalState.value, tableId)
const hasOperationalMapping = (tableId: string) => !props.operationsSnapshot || !!floorMapping.value?.tablesByLayoutId[tableId]
const backendTables = computed(() => props.backendTables ?? [])
const mappingState = (table: RestaurantTableConfig) => props.mappingLoading || props.mappingLoadError
  ? (table.backendTableId == null ? 'unmapped' as const : 'mapped' as const)
  : tableMappingState(table, tables.value, backendTables.value, props.restaurantId ?? -1)
const mappingText = (table: RestaurantTableConfig) => t(`floorLayout.mapping.state.${mappingState(table)}`)

// Animated customers replace the placeholder guest bodies; if their assets cannot load, fall back to the placeholders.
const customersFailed = ref(false)
const hiddenChairs = ref<Record<string, number[]>>({})
const customerStats = ref<CustomerStats | null>(null)

// One badge per target for this POC: its highest-priority event.
const topEvents = computed(() => selectTopEventPerTarget(props.operationalEvents ?? (props.operationsSnapshot ? [] : mockEvents)))
// The one clock for the scene: drives badge wait times and the table labels.
const now = useSceneClock()

// --- Table selection -------------------------------------------------------
const localSelection = ref<string | null>(null)
const hostOwnsSelection = computed(() => props.selectedLayoutTableId !== undefined)
const selectedTableId = computed({
  get: () => hostOwnsSelection.value ? props.selectedLayoutTableId ?? null : localSelection.value,
  set: (id: string | null) => { localSelection.value = id },
})
const selectedConfig = computed(() => (selectedTableId.value ? tableById(selectedTableId.value) ?? null : null))
const focus = computed(() => selectedConfig.value && !props.stage
  ? { x: selectedConfig.value.position.x, z: selectedConfig.value.position.z }
  : null)
// The real drawer wants the backend's table shape; the adapter builds it from lab data.
const selectedOperationsTable = computed(() => {
  const table = selectedConfig.value
  if (!table) return null
  if (props.operationsSnapshot) return floorMapping.value?.tablesByLayoutId[table.id] ?? null
  return toOperationsTable(table, stateOf(table.id), now.value)
})
const operationsTables = computed<OperationsTable[]>(() => {
  const snapshot = props.operationsSnapshot
  return snapshot ? [
    ...snapshot.floors.flatMap(floor => floor.zones.flatMap(zone => zone.tables)),
    ...snapshot.unassigned_tables,
  ] : []
})
const activeGuestCounts = computed<ActiveGuestCounts>(() => new Map(
  operationsTables.value.flatMap(table => table.session?.status === 'occupied' && Number.isSafeInteger(table.session.guest_count)
    ? [[table.id, table.session.guest_count] as [number, number]]
    : []),
))
const drawerStaff = computed(() => props.operationsSnapshot?.staff ?? [])
const drawerFreeTables = computed(() => operationsTables.value.filter(table => table.primary_status === 'free'))
const drawerCurrency = computed(() => props.operationsSnapshot?.restaurant.currency ?? LAB_CURRENCY)

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
  if (hostOwnsSelection.value) emit('tableSelected', tableId)
  else selectedTableId.value = tableId
}

const cameraRig = ref<{ recenter: () => void } | null>(null)
/** "Centrar vista": the camera returns to the overview and any table focus is released (the sheet closes). */
function recenterView(): void {
  cameraRig.value?.recenter()
  if (selectedTableId.value) {
    if (hostOwnsSelection.value) emit('tableSelected', null)
    else clearSelection()
  }
// The Dashboard stage draws its own Centrar vista button (the scene's one is hidden there) and asks through this.
watch(() => sceneCommands.recenter, () => { if (props.stage) recenterView() })
}

function clearSelection(): void {
  selectedTableId.value = null
}

// --- Saving ------------------------------------------------------------------
// One request at a time. A failure leaves the working copy and the dirty flag
// untouched; a success rebases the baseline without touching newer edits.
const snackbar = useSnackbar()
const saving = ref(false)
const saveError = ref<string | null>(null)
const mappingIssues = computed(() => props.restaurantId == null || props.mappingLoading || props.mappingLoadError
  ? []
  : validateTableMappings(tables.value, backendTables.value, props.restaurantId))
const capacityIssues = computed(() => validateCapacityAgainstOccupancy(tables.value, activeGuestCounts.value))
const canSave = computed(() => props.save !== undefined && isDirty.value && !saving.value && !props.saveBlocked && !entranceBlocking.value
  && !props.mappingLoading && mappingIssues.value.length === 0 && capacityIssues.value.length === 0)
watch(isDirty, (dirty) => emit('dirtyChange', dirty), { immediate: true, flush: 'sync' })
watch(saving, (value) => emit('savingChange', value), { flush: 'sync' })
onBeforeUnmount(() => { emit('dirtyChange', false); emit('savingChange', false) })

async function onSave(): Promise<void> {
  if (!props.save || !canSave.value) return
  // Authoritative check right before sending: the debounced one may predate the last table edit.
  runEntranceCheck()
  if (entranceBlocking.value) return
  const sent = toDocument()
  saveError.value = null
  saving.value = true
  try {
    const canonical = await props.save(sent)
    markSaved(canonical.tables, sent.tables, { canonical: canonical.entrance, sent: sent.entrance })
    snackbar.showSnackbar({ message: t('floorLayout.saved'), kind: 'success' })
  } catch (cause) {
    if (cause instanceof FloorLayoutConflictError) {
      // Nothing was written and the draft is untouched; the view blocks saving until the latest layout is loaded.
      saveError.value = t('floorLayout.conflict.saveRefused')
      snackbar.showSnackbar({ message: saveError.value, kind: 'danger', duration: 8000 })
      return
    }
    const apiError = normalizeApiError(cause)
    saveError.value = apiError.fieldErrors
      ? Object.values(apiError.fieldErrors).flat().join(' ')
      : describeApiError(apiError, t)
    snackbar.showSnackbar({ message: saveError.value, kind: 'danger', duration: 8000 })
  } finally {
    saving.value = false
  }
}

function onDiscard(): void {
  if (saving.value) return
  discard()
  editSelectedId.value = null
  entranceSelected.value = false
  entrancePlacing.value = false
  editError.value = null
  saveError.value = null
  runEntranceCheck()
}

function onMapBackendTable(backendTableId: number | null): void {
  if (!editSelectedId.value) return
  if (backendTableId !== null && !backendTables.value.some((table) => table.id === backendTableId && table.restaurant_id === props.restaurantId)) {
    editError.value = t('floorLayout.mapping.invalidSelection')
    return
  }
  if (!setBackendTable(editSelectedId.value, backendTableId)) {
    editError.value = t('floorLayout.mapping.conflictWarning')
    return
  }
  editError.value = null
  saveError.value = null
}

// --- Layout editing ---------------------------------------------------------
// Edit mode keeps its own selection: no camera focus, no detail sheet.
const editSelectedId = ref<string | null>(null)
const editSelectedTable = computed(() => (editSelectedId.value ? tableById(editSelectedId.value) ?? null : null))
const draggingTable = ref(false)

// --- Entrance ---------------------------------------------------------------
// Validated on placement completion, on table changes (debounced) and right before saving, never per pointer move.
const entranceSelected = ref(false)
const entranceHovered = ref(false)
const entrancePlacing = ref(false)
const draggingEntrance = ref(false)
const entranceCheck = ref<EntranceValidation | null>(null)
const entranceBlocking = computed(() => !!entranceCheck.value && !entranceCheck.value.ok)
function runEntranceCheck(): void {
  entranceCheck.value = behavior.value.layoutEditing && draftEntrance.value
    ? validateEntrancePlacement(tables.value, draftEntrance.value)
    : null
}
const layoutKey = computed(() => JSON.stringify([
  tables.value.map((table) => [table.id, table.shape, table.seats, table.rotation, table.position.x, table.position.z]),
  draftEntrance.value,
]))
let checkTimer: ReturnType<typeof setTimeout> | undefined
watch([layoutKey, () => behavior.value.layoutEditing], () => {
  clearTimeout(checkTimer)
  if (draggingTable.value || draggingEntrance.value) return
  checkTimer = setTimeout(runEntranceCheck, 250)
}, { immediate: true })
watch([draggingTable, draggingEntrance], ([table, entranceDrag]) => { if (!table && !entranceDrag) { clearTimeout(checkTimer); runEntranceCheck() } })
onBeforeUnmount(() => clearTimeout(checkTimer))

function onAddEntrance(): void {
  setEntrance(suggestEntrance(tables.value))
  editSelectedId.value = null
  entranceSelected.value = true
  runEntranceCheck()
}
// Typed coordinates are validated, never clamped: a non-number or a point past the navigable floor is refused and
// explained, and the entrance stays where it was.
const entranceInputIssue = ref<'invalid_coordinates' | 'outside_floor' | null>(null)
function onTypeEntrance(position: { x: number; z: number }): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    entranceInputIssue.value = 'invalid_coordinates'
    return
  }
  const limits = entranceLimits()
  const snapped = { x: snapToGrid(position.x), z: snapToGrid(position.z) }
  if (Math.abs(snapped.x) > limits.x || Math.abs(snapped.z) > limits.z) {
    entranceInputIssue.value = 'outside_floor'
    return
  }
  entranceInputIssue.value = null
  onSetEntrance(snapped)
}
function onSetEntrance(position: { x: number; z: number }): void {
  entranceInputIssue.value = null
  setEntrance(position)
  entranceSelected.value = true
  runEntranceCheck()
}
function onRemoveEntrance(): void {
  entranceInputIssue.value = null
  setEntrance(null)
  entranceSelected.value = false
  entrancePlacing.value = false
  entranceCheck.value = null
}
function onSelectEntrance(): void {
  editSelectedId.value = null
  entranceSelected.value = true
}
function onFloorSelect(id: string | null): void {
  editSelectedId.value = id
  if (id !== null) entranceSelected.value = false
  else if (!draggingEntrance.value) entranceSelected.value = false
}

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

// Drag / typed / rotated placements the layout refuses leave the table where it was; the table is flagged until the gesture ends.
const hoveredTableId = ref<string | null>(null)
const blockedTableId = ref<string | null>(null)
function noteBlocked(id: string, result: EditResult): void {
  blockedTableId.value = result.ok ? (blockedTableId.value === id ? null : blockedTableId.value) : id
  editError.value = firstMessage(result)
}
function onMoveTable(id: string, position: FloorPosition): void {
  noteBlocked(id, moveTable(id, position))
}
function onTableDragging(active: boolean): void {
  draggingTable.value = active
  if (!active) blockedTableId.value = null
}
function onPositionTable(position: FloorPosition): void {
  if (editSelectedId.value) noteBlocked(editSelectedId.value, setTablePosition(editSelectedId.value, position))
}
function onRotateTable(direction: 1 | -1): void {
  if (editSelectedId.value) noteBlocked(editSelectedId.value, rotateTable(editSelectedId.value, direction))
}

// One coherent dock: a collapsible card with the save row, then "Mesa" / "Entrada" sections. It starts collapsed on
// narrow screens so it never covers the scene; picking something in the scene opens the right section.
const dockTab = ref<'table' | 'entrance'>('table')
const dockCollapsed = ref(window.matchMedia('(max-width: 640px)').matches)
// On a phone the dock spans the bottom of the canvas; the camera frames the floor above it so tables stay reachable.
const dock = ref<HTMLElement | null>(null)
const dockInset = ref(0)
let dockObserver: ResizeObserver | undefined
watch(dock, (el) => {
  dockObserver?.disconnect()
  dockObserver = undefined
  if (!el || typeof ResizeObserver === 'undefined') { dockInset.value = 0; return }
  const measure = () => { dockInset.value = window.innerWidth <= 640 ? Math.round(el.offsetHeight + 8) : 0 }
  measure()
  dockObserver = new ResizeObserver(measure)
  dockObserver.observe(el)
}, { flush: 'post' })
onBeforeUnmount(() => dockObserver?.disconnect())
watch(editSelectedId, (id) => { if (id) { dockTab.value = 'table'; dockCollapsed.value = false } })
watch(entranceSelected, (on) => { if (on) { dockTab.value = 'entrance'; dockCollapsed.value = false } })

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
watch(localSelection, (id) => { if (!hostOwnsSelection.value) emit('tableSelected', id) })

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
  entranceSelected.value = false
  entrancePlacing.value = false
  draggingEntrance.value = false
})

// The reused drawer talks to the real API layer; keep lab tables off the network.
let removeApiGuard: (() => void) | undefined
onMounted(() => {
  if (!props.operationsSnapshot) removeApiGuard = installLabApiGuard()
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
    for (const problem of validateOperationalState(source, operationalState.value, mockEvents)) {
      console.warn(`[restaurant-3d] ${problem}`)
    }
  }
}

// Three-quarter view from above, aimed at the middle of the table layout and pulled back just far enough that every table,
// label and operational pill (at its real on-screen size) fits the canvas — see framing.ts. The canvas has no size yet at
// setup, so this is an estimate; CameraRig re-fits to the measured canvas on mount (unless the person has moved the camera).
// Chosen once per mount (see graphics-quality.ts): predictable, no mid-session quality changes.
const quality = chooseQuality(detectDeviceHints())
/** A phone in landscape (short screen): the stage keeps only a strip of stats on top and a row of toggles below. */
const STAGE_SHORT_VIEWPORT_PX = 520
const shortStage = props.stage && window.innerHeight <= STAGE_SHORT_VIEWPORT_PX
const compactViewport = window.innerWidth <= 640 || shortStage
/** Dashboard stage: raised, mostly frontal view (about 12 degrees off the front axis, 33 degrees up) so the room reads as a maquette. */
const STAGE_DIRECTION: [number, number, number] = [0.17, 0.55, 0.82]
/** Short, wide stage (a phone in landscape): steeper, so the room's depth uses the little height there is. */
const STAGE_SHORT_DIRECTION: [number, number, number] = [0.14, 0.8, 0.58]
const STAGE_WALL_HEIGHT = 2.4
/** A phone-wide stage needs the camera farther back than the demo room's 70 m to fit the whole room. */
const STAGE_MAX_DISTANCE = 110
/** Px kept free around the room on the dashboard stage: the stat row on top, the legend/queue row below, a little at the sides. */
const STAGE_INSETS = shortStage
  ? { top: 60, right: 12, bottom: 64, left: 12 }
  : window.innerWidth <= 640
    ? { top: 108, right: 12, bottom: 64, left: 12 }
    : { top: 76, right: 40, bottom: 72, left: 40 }
const initialFrame = frameRestaurant({
  tables: tables.value,
  entrance: draftEntrance.value,
  includeFloor: behavior.value.layoutEditing || props.stage || props.environment === 'ultimate',
  context: compactViewport ? urbanCompactContext.value : urbanContext.value,
  wallHeight: props.stage ? STAGE_WALL_HEIGHT : props.environment === 'ultimate' ? 3 : undefined,
  maxDistance: props.stage ? STAGE_MAX_DISTANCE : props.environment === 'ultimate' ? 70 : undefined,
  // Isometric-like view (corner of the room at the top centre): the Ultimate demo and the dashboard stage.
  direction: props.stage ? (shortStage ? STAGE_SHORT_DIRECTION : STAGE_DIRECTION) : props.environment === 'ultimate' ? ultimateDirection(window.innerWidth) : undefined,
  width: props.stage ? window.innerWidth : compactViewport ? window.innerWidth : Math.min(window.innerWidth - 48, 1100),
  height: props.stage ? window.innerHeight - 56 : Math.max(360, Math.min(720, window.innerHeight - (compactViewport ? 190 : 220))),
  viewportWidth: window.innerWidth,
  insets: props.stage ? STAGE_INSETS : undefined,
})
const cameraPosition = initialFrame.position
const cameraTarget = initialFrame.target
</script>

<template>
  <div
    class="restaurant-scene"
    :class="{ 'restaurant-scene--stage': stage }"
    @pointerdown.capture="onPress"
  >
    <TresCanvas
      :clear-color="stage ? LIGHT_STAGE.background : '#151515'"
      @error="reportSceneFailure?.('context-creation')"
      shadows
      :tone-mapping="ultimateFinal ? NeutralToneMapping : ACESFilmicToneMapping"
      :tone-mapping-exposure="ultimateFinal ? 1.25 : 1"
      :dpr="quality.dpr"
    >
      <!-- Urban scene: the finite world dissolves into the background colour before its far end (see camera-limits.ts). -->
      <TresFog v-if="urban" :args="[stage ? LIGHT_STAGE.background : '#151515', WORLD_FOG.near, WORLD_FOG.far]" attach="fog" />

      <!-- Câmera inicial estilo isométrico -->
      <TresPerspectiveCamera
        :position="cameraPosition"
        :look-at="cameraTarget"
        :fov="35"
        :near="0.1"
        :far="1000"
      />

      <!-- Iluminação ambiente: meio-hemisférico suave (preenchimento) -->
      <TresHemisphereLight
        :args="stage ? ['#ffffff', '#d8cdc0', 1.5] : ['#fff4e6', '#5a4632', ultimateFinal ? 1.0 : 1.2]"
      />

      <!-- Luz principal: direcional ampla; no cenário Ultimate a sombra é mais suave e o frustum cobre o salão todo -->
      <TresDirectionalLight
        :position="ultimateFinal ? [4, 16, 9] : [8, 14, 6]"
        :intensity="stage ? 2.2 : ultimateFinal ? 2.1 : 2.5"
        :color="stage ? '#fff7ec' : '#fff0d8'"
        cast-shadow
        :shadow-mapSize-width="quality.shadowMapSize"
        :shadow-mapSize-height="quality.shadowMapSize"
        :shadow-camera-left="-FLOOR.width / 2 - 2"
        :shadow-camera-right="FLOOR.width / 2 + 2"
        :shadow-camera-top="FLOOR.width / 2 + 2"
        :shadow-camera-bottom="-FLOOR.width / 2 - 2"
        :shadow-camera-near="1"
        :shadow-camera-far="40"
        :shadow-bias="-0.0004"
        :shadow-normal-bias="0.03"
        :shadow-radius="stage ? 5 : ultimateFinal ? 4 : 1"
        :shadow-intensity="stage ? 0.45 : ultimateFinal ? 0.55 : 1"
      />

      <!-- Base plus instanced 1 m modules. The operational map remains a separate scene layer. -->
      <TresMesh
        :position="[0, -0.01, 0]"
        :rotation="[-Math.PI / 2, 0, 0]"
        receive-shadow
      >
        <TresPlaneGeometry :args="[FLOOR.width, FLOOR.depth]" />

        <TresMeshStandardMaterial
          :color="stage ? LIGHT_STAGE.base : '#b99875'"
          :roughness="0.8"
        />
      </TresMesh>

      <template v-if="environment === 'ultimate'">
        <UltimateEnvironment :finish="finish" :entrance="entrance" :plan="urban" />
        <UrbanExterior v-if="urban" :plan="urban" :stage="stage" />
      </template>
      <template v-else>
        <ModularFloor :light="stage" />
        <RestaurantEnvironment :entrance="entrance" :light="stage" />
      </template>

      <!-- Mesas e cadeiras a partir do layout -->
      <RestaurantTable
        v-for="table in tables"
        :key="table.id"
        :table="table"
        :furniture="environment === 'ultimate' ? 'ultimate' : 'kaykit'"
        :finish="finish"
        :state="stateOf(table.id)"
        :events="topEvents"
        :operational-flags="floorMapping?.flagsByLayoutId[table.id] ?? []"
        :now="now"
        :selected="behavior.layoutEditing ? table.id === editSelectedId : table.id === selectedTableId"
        :hovered="behavior.layoutEditing && !draggingTable && table.id === hoveredTableId"
        :invalid="behavior.layoutEditing && table.id === blockedTableId"
        :mapping-state="behavior.layoutEditing ? mappingState(table) : undefined"
        :mapping-label="behavior.layoutEditing ? mappingText(table) : undefined"
        :show-operational="behavior.showOperational && hasOperationalMapping(table.id)"
        :guest-bodies="customersFailed"
        @select="onTableSelect"
      />

      <ChairInstances
        :tables="tables"
        :hidden="hiddenChairs"
        :furniture="environment === 'ultimate' ? 'ultimate' : 'kaykit'"
        :finish="finish"
      />

      <!-- Seated customers: one per explicit guest record; hidden while the layout is being edited. -->
      <RestaurantCustomers
        :tables="tables"
        :states="operationalState"
        :enabled="behavior.showOperational"
        :entrance="entrance"
        :urban="urban"
        :cover-eye="coverEye"
        :debug="navDebug"
        @stats="customerStats = $event; emit('stats', $event)"
        @failed="customersFailed = true"
        @chairs-hidden="hiddenChairs = $event"
        @entrance="emit('entranceStatus', $event)"
        @nav-failure="emit('navFailure', $event)"
      />

      <!-- Edit mode only: the entrance is configuration, not operational data. -->
      <EntranceFloorMarker
        v-if="behavior.layoutEditing && draftEntrance"
        :x="draftEntrance.x"
        :z="draftEntrance.z"
        :label="t('floorLayout.entrance.label')"
        :selected="entranceSelected"
        :hovered="entranceHovered"
        :valid="!entranceBlocking"
      />

      <TableEditController
        :enabled="behavior.layoutEditing"
        :tables="tables"
        :entrance="draftEntrance"
        :placing-entrance="entrancePlacing"
        @select="onFloorSelect"
        @move="onMoveTable"
        @dragging="onTableDragging"
        @hover-table="hoveredTableId = $event"
        @select-entrance="onSelectEntrance"
        @entrance-dragging="draggingEntrance = $event"
        @move-entrance="onSetEntrance"
        @drop-entrance="entrancePlacing = false; runEntranceCheck()"
        @hover-entrance="entranceHovered = $event"
      />

      <CameraRig
        ref="cameraRig"
        :focus="focus"
        :tables="tables"
        :entrance="draftEntrance"
        :context="urbanContext"
        :compact-context="urbanCompactContext"
        :include-floor="behavior.layoutEditing || stage || environment === 'ultimate'"
        :frame-insets="stage ? STAGE_INSETS : undefined"
        :max-distance="stage ? STAGE_MAX_DISTANCE : undefined"
        :wall-height="stage ? STAGE_WALL_HEIGHT : environment === 'ultimate' ? 3 : 0"
        :reframe-key="overview ? 1 : 0"
        :bottom-inset="behavior.layoutEditing ? dockInset : 0"
        :initial-target="cameraTarget"
        :orbit-enabled="!draggingTable && !draggingEntrance"
      />
    </TresCanvas>

    <!-- Camera reset: always visible, 44 px target, keyboard focusable; releases a table focus too. -->
    <button
      v-if="!stage"
      type="button"
      class="recenter-view"
      data-recenter-view
      @click="recenterView"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      </svg>
      {{ t('floorLayout.recenterView') }}
    </button>

    <dl
      v-if="diagnostics && customerStats && behavior.showOperational"
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
      <!-- Operation mode: a draft that is still unsaved stays visible, nothing else of the editor. -->
      <span
        v-if="!behavior.layoutEditing && isDirty"
        class="editor-dirty"
        role="status"
      >Cambios sin guardar</span>

      <section
        v-if="behavior.layoutEditing"
        class="editor-dock"
        ref="dock"
        :class="{ 'editor-dock--collapsed': dockCollapsed }"
        :aria-label="t('floorLayout.editor.mode')"
      >
        <header class="editor-dock__header">
          <span class="editor-dock__mode">{{ t('floorLayout.editor.mode') }}</span>
          <span v-if="isDirty" class="editor-dirty" role="status">Cambios sin guardar</span>
          <button
            type="button"
            class="editor-dock__toggle"
            :aria-expanded="!dockCollapsed"
            :aria-label="dockCollapsed ? t('floorLayout.editor.expand') : t('floorLayout.editor.collapse')"
            @click="dockCollapsed = !dockCollapsed"
          >
            {{ dockCollapsed ? '▴' : '▾' }}
          </button>
        </header>

        <div v-if="isDirty || save" class="editor-save">
          <button
            v-if="save"
            type="button"
            class="editor-add editor-save__button"
            :disabled="!canSave"
            :aria-busy="saving"
            @click="onSave"
          >
            {{ saving ? t('floorLayout.saving') : t('floorLayout.save') }}
          </button>
          <button
            v-if="isDirty"
            type="button"
            class="editor-discard"
            :disabled="saving"
            @click="onDiscard"
          >
            {{ t('floorLayout.discard') }}
          </button>
        </div>
        <p v-if="mappingIssues.length" class="editor-save-error" role="alert">
          {{ t('floorLayout.mapping.repairBeforeSave', { count: mappingIssues.length }) }}
        </p>
        <p v-else-if="capacityIssues.length" class="editor-save-error" role="alert">
          {{ t('floorLayout.mapping.capacityBelowGuests', { count: capacityIssues.length }) }}
        </p>
        <p v-else-if="entranceBlocking" class="editor-save-error" role="alert">
          {{ t('floorLayout.entrance.saveBlocked') }}
        </p>
        <p v-else-if="saveError" class="editor-save-error" role="alert">{{ saveError }}</p>

        <div v-show="!dockCollapsed" class="editor-dock__body">
          <div class="editor-tabs" role="tablist" :aria-label="t('floorLayout.editor.sections')">
            <button
              type="button"
              role="tab"
              class="editor-tabs__tab"
              :aria-selected="dockTab === 'table'"
              @click="dockTab = 'table'"
            >{{ t('floorLayout.editor.tabTable') }}</button>
            <button
              type="button"
              role="tab"
              class="editor-tabs__tab"
              :aria-selected="dockTab === 'entrance'"
              @click="dockTab = 'entrance'"
            >{{ t('floorLayout.editor.tabEntrance') }}<span v-if="entranceBlocking" class="editor-tabs__dot" aria-hidden="true" /></button>
          </div>

          <template v-if="dockTab === 'table'">
            <label v-if="tables.length" class="editor-picker">
              <span>{{ t('floorLayout.mapping.selectVisualTable') }}</span>
              <select v-model="editSelectedId" :aria-label="t('floorLayout.mapping.selectVisualTable')">
                <option :value="null">{{ t('floorLayout.mapping.chooseVisualTable') }}</option>
                <option v-for="table in tables" :key="table.id" :value="table.id">
                  {{ t('floorLayout.mapping.visualTableOption', { number: table.number, state: mappingText(table) }) }}
                </option>
              </select>
            </label>
            <button
              v-if="!addPanelOpen"
              type="button"
              class="editor-add"
              @click="openAddPanel"
            >
              + Agregar mesa
            </button>
            <AddTablePanel
              v-else
              :tables="tables"
              :error="addError"
              @create="onAddTable"
              @cancel="addPanelOpen = false"
            />
            <p v-if="!editSelectedTable && !addPanelOpen" class="editor-dock__hint">{{ t('floorLayout.editor.selectHint') }}</p>
            <EditorToolbar
              v-if="editSelectedTable"
              :table="editSelectedTable"
              :layout-tables="tables"
              :backend-tables="backendTables"
              :restaurant-id="restaurantId ?? null"
              :mapping-loading="mappingLoading"
              :mapping-load-error="mappingLoadError"
              :error="editError"
              @rotate="onRotateTable"
              @update="onUpdateTable"
              @position="onPositionTable"
              @map="onMapBackendTable"
              @duplicate="onDuplicateTable"
              @remove="onRemoveTable"
            />
          </template>

          <EntrancePanel
            v-else
            :entrance="draftEntrance"
            :check="entranceCheck"
            :selected="entranceSelected"
            :placing="entrancePlacing"
            :input-issue="entranceInputIssue"
            @add="onAddEntrance"
            @select="onSelectEntrance"
            @place="entrancePlacing = $event; if ($event) onSelectEntrance()"
            @set="onSetEntrance"
            @type="onTypeEntrance"
            @remove="onRemoveEntrance"
          />
        </div>
      </section>
    </div>

    <!-- The application's own table-detail sheet, not a lab copy. -->
    <TableDetailsDrawer
      v-if="!hostOwnsSelection"
      :table="selectedOperationsTable"
      :staff="drawerStaff"
      :free-tables="drawerFreeTables"
      :currency="drawerCurrency"
      dashboard-mode
      @close="clearSelection"
      @refresh="emit('refreshOperationalData')"
    />
  </div>
</template>

<style scoped>
.recenter-view {
  position: absolute;
  inset: 12px 12px auto auto;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid rgb(242 234 227 / 0.22);
  border-radius: 999px;
  background: rgb(23 24 28 / 0.9);
  color: #f2eae3;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}
.recenter-view:hover { background: rgb(40 41 46 / 0.95); border-color: rgb(242 234 227 / 0.4); }
.recenter-view:focus-visible { outline: 2px solid #f2eae3; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .recenter-view { transition: none; } }
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

/* A debug panel must not cover tables on a phone; its values stay in the DOM for tooling. */
@media (max-width: 640px) { .dev-stats { display: none; } }
.dev-stats dt { white-space: nowrap; }
.dev-stats dt { opacity: 0.6; }
.dev-stats dd { margin: 0; font-variant-numeric: tabular-nums; }

/* Own stacking context: the 3D labels (positive z-index, drei Html) and the dock never compete outside the scene. */
.restaurant-scene { isolation: isolate; }

.editor-overlay {
  z-index: 20;
  position: absolute;
  inset: auto 16px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-height: calc(100% - 32px);
  pointer-events: none;
}

/* One dock instead of several overlays: save row on top, a scrolling body below. */
.editor-dock {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(100%, 24rem);
  max-height: 100%;
  min-height: 0;
  padding: 10px;
  border: 1px solid #343434;
  border-radius: 16px;
  background: rgb(23 24 28 / 0.9);
  backdrop-filter: blur(10px);
  color: #f2eae3;
}
.editor-dock__header { display: flex; align-items: center; gap: 8px; }
.editor-dock__mode { flex: 1; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(242 234 227 / 0.72); }
.editor-dock__toggle {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid #343434;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.editor-dock__toggle:focus-visible, .editor-tabs__tab:focus-visible { outline: 2px solid #f2eae3; outline-offset: 2px; }
.editor-dock__body { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.editor-dock__body > * { max-width: 100%; }
.editor-dock__hint { margin: 0; font-size: 12px; color: rgb(242 234 227 / 0.72); }
.editor-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; border-radius: 12px; background: rgb(255 255 255 / 0.06); }
.editor-tabs__tab {
  position: relative;
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgb(242 234 227 / 0.72);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.editor-tabs__tab[aria-selected='true'] { background: rgb(255 255 255 / 0.14); color: #f2eae3; }
.editor-tabs__dot { position: absolute; top: 8px; right: 10px; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }
@media (prefers-reduced-motion: reduce) { .editor-tabs__tab { transition: none; } }

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

.editor-picker {
  display: grid;
  gap: 4px;
  width: min(100%, 22rem);
  color: #f2eae3;
  font-size: 12px;
}

/* Same type as the neighbouring Save / add buttons (13px), not the 16px of `font: inherit`. */
.editor-picker select, .editor-discard {
  box-sizing: border-box;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 10px;
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  font: inherit;
}

.editor-picker select:focus-visible, .editor-discard:focus-visible {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

.editor-discard { cursor: pointer; font-size: 13px; }
.editor-discard:disabled { opacity: 0.5; cursor: not-allowed; }
.editor-save-error { max-width: min(100%, 32rem); margin: 0; color: #ffd8d3; font-size: 12px; }

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
  height: min(720px, calc(100dvh - 220px));
  min-height: 400px;
  overflow: hidden;
  background: #151515;
}

/* Dashboard stage: fills whatever positioned box the host gives it; nothing of the lab's fixed sizing applies. */
.restaurant-scene.restaurant-scene--stage { width: 100%; height: 100%; min-height: 0; margin: 0; background: #e9e4de; }

@media (max-width: 640px) {
  .editor-overlay { inset-inline: 8px; inset-block-end: max(8px, env(safe-area-inset-bottom)); max-height: min(55%, calc(100% - 16px)); }
  .editor-dock { width: 100%; }
  .restaurant-scene:not(.restaurant-scene--stage) { width: calc(100% + 48px); margin-inline: -24px; height: min(720px, calc(100dvh - 190px)); min-height: 360px; }
  .editor-save { flex-wrap: wrap; }
}
</style>
