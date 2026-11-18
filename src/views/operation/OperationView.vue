<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalendarX, PhCaretRight, PhPencilSimple, PhTable } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AStatStrip from '@/components/dashboard/AStatStrip.vue'
import RestaurantOnboarding from '@/components/dashboard/RestaurantOnboarding.vue'
import AttentionQueue from '@/components/dashboard/operation/AttentionQueue.vue'
import CapacityPanel from '@/components/dashboard/operation/CapacityPanel.vue'
import DashboardTableOverview from '@/components/dashboard/operation/DashboardTableOverview.vue'
import FloorMapEditor from '@/components/dashboard/operation/FloorMapEditor.vue'
import FloorViewSwitch from '@/components/dashboard/operation/FloorViewSwitch.vue'
import KitchenLivePanel from '@/components/dashboard/operation/KitchenLivePanel.vue'
import DashboardPanelCard from '@/components/dashboard/operation/DashboardPanelCard.vue'
import OperationalToastHost from '@/components/dashboard/operation/OperationalToastHost.vue'
import QuickActions from '@/components/dashboard/operation/QuickActions.vue'
import SceneCameraTools from '@/components/dashboard/operation/SceneCameraTools.vue'
import StageLegend from '@/components/dashboard/operation/stage/StageLegend.vue'
import RecentActivityPanel from '@/components/dashboard/operation/RecentActivityPanel.vue'
import RestaurantFloorMap from '@/components/dashboard/operation/RestaurantFloorMap.vue'
import StaffLivePanel from '@/components/dashboard/operation/StaffLivePanel.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useActivityPanelToggle } from '@/composables/useActivityPanelToggle'
import { usePermissions } from '@/composables/usePermissions'
import { useShellStage } from '@/composables/useShellStage'
import { useOperationalToasts } from '@/composables/useOperationalToasts'
import { useRestaurantFloorLayout } from '@/composables/useRestaurantFloorLayout'
import { useRecentActivity } from '@/composables/useRecentActivity'
import { useAuthStore } from '@/stores/auth'
import { appConfig } from '@/config/runtime'
import type { Dashboard3DMode } from '@/config/env'
import SceneRuntimeGuard from '@/components/restaurant-3d/SceneRuntimeGuard.vue'
import { supportsWebGL, type SceneFailureReason } from '@/components/restaurant-3d/scene-runtime-guard'
import type { RealtimeConnectionState } from '@/types/realtime'
import { SERVICE_ACCESS_PERMISSIONS } from '@/types/auth-context'
import type { OperationsAlert, OperationsLiveSnapshot, OperationsTable } from '@/types/operations'
import type { ReceivedRealtimeEvent } from '@/composables/useRestaurantRealtime'
import { formatNumber } from '@/utils/format'
import { classifyOperationAge } from '@/utils/operation-timing'
import { operationsAlertActionKey, operationsAlertTypeLabelKey } from '@/utils/operations-alerts'
import type { OperationalToast } from '@/utils/operational-toast-queue'

const props = defineProps<{
  restaurantId: number | null
  snapshot: OperationsLiveSnapshot | null
  loading: boolean
  refreshing: boolean
  error: import('@/api/errors').ApiError | null
  /** Passo 1.3: raw, non-debounced — only the Floor Map Editor cares about one specific event name here (§20). */
  lastRealtimeEvent: ReceivedRealtimeEvent | null
  /** Carta 8.1B — a table to auto-open once `snapshot` actually has it (deep-link from a QR scan or a bookmarked URL). Null/undefined the rest of the time. */
  pendingTableId?: number | null
  /** Which 3D room to use; the build decides (`VITE_DASHBOARD_3D`). A prop so each mode can be exercised without a rebuild. */
  scene3d?: Dashboard3DMode
  /** Realtime connection, shown in the compact top bar of the 3D stage. */
  connectionState?: RealtimeConnectionState
}>()

const emit = defineEmits<{ refresh: []; 'pending-table-consumed': [] }>()

const { t, locale } = useI18n()
const { can, canAny } = usePermissions()
const authStore = useAuthStore()

const canManageFloorPlan = computed(() => can('manage_floor_plan'))
const canViewService = computed(() => canAny(SERVICE_ACCESS_PERMISSIONS))
const canViewKitchen = computed(() => canAny(['update_kitchen_status', 'serve_orders']))
const canViewStaff = computed(() => can('manage_users'))
const canViewActivity = computed(() => can('view_activity'))
const canManageDailyOperation = computed(() => can('open_daily_operation') || can('close_daily_operation'))

const selectedTableId = ref<number | null>(null)
const selectedAlertId = ref<string | null>(null)
const detailsOpen = ref(false)
const showEditor = ref(false)
// The 3D room is the default whenever the restaurant has a saved layout; Plan stays one click away. Until the person
// chooses, an empty (never saved) layout falls back to Plan on its own.
const sceneMode = computed<Dashboard3DMode>(() => props.scene3d ?? appConfig.dashboard3d)
const threeDEnabled = computed(() => sceneMode.value !== 'off')
const floorView = ref<'plan' | '3d'>(threeDEnabled.value ? '3d' : 'plan')
const userChoseView = ref(false)
function setFloorView(view: 'plan' | '3d'): void {
  userChoseView.value = true
  floorView.value = view === '3d' && !threeDEnabled.value ? 'plan' : view
  // Leaving or re-entering 3D is a fresh attempt: a previous run-time failure never sticks to the new view.
  sceneRuntimeFailure.value = null
}
// `off` never touches the scene: no chunk, no layout request.
const showScene = computed(() => threeDEnabled.value && floorView.value === '3d')

// The 3D scene is a heavy chunk: loaded only when the 3D view is first opened.
// A failed download is surfaced as state (never a blank panel). The browser
// keeps a failed module fetch until the page reloads, so there is no in-place
// retry for it — the plan view stays one click away instead.
const sceneChunkFailed = ref(false)
const RestaurantScene = defineAsyncComponent({
  loader: () => import('@/components/restaurant-3d/RestaurantScene.vue').catch(() => {
    sceneChunkFailed.value = true
    return { render: () => null } as Component
  }),
  loadingComponent: { render: () => h('p', { class: 'text-body-sm text-fg-muted', role: 'status' }, t('operations.board.floor.sceneLoading')) },
  delay: 150,
})
function showPlan(): void {
  setFloorView('plan')
}
// Run-time scene failures (initialisation/render error, WebGL context lost or unavailable). Chunk and layout failures
// keep their own flags below; all three end at the same panel with the plan one click away.
const sceneRuntimeFailure = ref<SceneFailureReason | null>(null)
const sceneAttempt = ref(0)
// Probed lazily and once, and never while 3D is off.
let webglProbe: boolean | null = null
const deviceSupportsWebGL = (): boolean => (webglProbe ??= supportsWebGL())
function onSceneFailed(reason: SceneFailureReason): void { sceneRuntimeFailure.value = reason }
function retryScene(): void {
  sceneRuntimeFailure.value = null
  sceneAttempt.value++
}
// A different restaurant starts from a clean slate: no failure carried over, and a Plan that was only the automatic
// fallback for a restaurant without a layout gives way to 3D again (a view the person chose is kept).
watch(() => props.restaurantId, () => {
  sceneRuntimeFailure.value = null
  if (!userChoseView.value && threeDEnabled.value) floorView.value = '3d'
})
const layoutRestaurantId = computed(() => showScene.value && props.snapshot ? props.restaurantId : null)
const { state: layoutState, layout: sceneLayout, revision: layoutRevision, reload: reloadLayout } =
  useRestaurantFloorLayout(layoutRestaurantId)

watch([layoutState, sceneLayout], () => {
  if (!userChoseView.value && layoutState.value === 'ready' && !sceneLayout.value?.tables.length) floorView.value = 'plan'
})

watch(() => props.lastRealtimeEvent, event => {
  if (event?.name === 'floor_plan.updated' && event.restaurant_id === layoutRestaurantId.value) void reloadLayout()
})

/**
 * Every trigger that opens the Floor Map Editor goes through this — never
 * `showEditor.value = true` directly — so a user without manage_floor_plan
 * can never reach it, even in depth (CLAUDE.md §17): the template also
 * hides every CTA that would call this, this is defense in depth for that.
 */
function openFloorEditor(): void {
  if (!canManageFloorPlan.value) return
  showEditor.value = true
}

// The board reacts to its own width, not the viewport: the shell's rail or
// expanded sidebar changes the space actually available. The thresholds
// match the @2xl/@4xl container classes in the template below.
const board = ref<HTMLElement | null>(null)
const boardWidth = ref(0)
let resizeObserver: ResizeObserver | null = null
const showFloorMap = computed(() => boardWidth.value >= 672)

function observeBoard(element: HTMLElement | null): void {
  resizeObserver?.disconnect()
  if (!element) return
  boardWidth.value = element.getBoundingClientRect().width
  resizeObserver = new ResizeObserver(([entry]) => { if (entry) boardWidth.value = entry.contentRect.width })
  resizeObserver.observe(element)
}
onMounted(() => observeBoard(board.value))
watch(board, observeBoard)
onBeforeUnmount(() => resizeObserver?.disconnect())

const allTables = computed<OperationsTable[]>(() => {
  if (!props.snapshot) return []
  const fromFloors = props.snapshot.floors.flatMap((floor) => floor.zones.flatMap((zone) => zone.tables))
  return [...fromFloors, ...props.snapshot.unassigned_tables]
})

const selectedTable = computed(() => allTables.value.find((table) => table.id === selectedTableId.value) ?? null)
const selectedSceneTableId = computed(() => selectedTable.value
  ? sceneLayout.value?.tables.find(table => table.backendTableId === selectedTable.value?.id)?.id ?? null
  : null)

// Tables the saved 3D layout does not place (never linked, or added after the
// layout was saved). They stay reachable from the dashboard, never only in Plan.
const sceneLinkedTableIds = computed<ReadonlySet<number>>(() => new Set(
  sceneLayout.value?.tables.flatMap(table => table.backendTableId == null ? [] : [table.backendTableId]) ?? [],
))
const tablesOutsideScene = computed(() => allTables.value.filter(table => !sceneLinkedTableIds.value.has(table.id)))
const sceneBlockedByDevice = computed(() => showScene.value && !deviceSupportsWebGL())
const sceneReady = computed(() => !sceneChunkFailed.value && !sceneBlockedByDevice.value && !sceneRuntimeFailure.value && !!sceneLayout.value?.tables.length)
const sceneUnavailable = computed(() => sceneChunkFailed.value || sceneBlockedByDevice.value || !!sceneRuntimeFailure.value || layoutState.value === 'error')
const sceneFailureMessage = computed(() => sceneBlockedByDevice.value
  ? t('operations.board.floor.sceneNoWebgl')
  : sceneRuntimeFailure.value ? t('operations.board.floor.sceneRuntimeError') : t('operations.board.floor.sceneError'))
// Retry only helps where something can change: a layout request, or a scene that crashed on a device that does render.
const sceneRetryAction = computed<(() => void) | null>(() => sceneChunkFailed.value || sceneBlockedByDevice.value
  ? null
  : sceneRuntimeFailure.value ? retryScene : () => { void reloadLayout() })

function selectSceneTable(id: string | null): void {
  const backendId = sceneLayout.value?.tables.find(table => table.id === id)?.backendTableId
  const table = allTables.value.find(table => table.id === backendId)
  if (table) selectTable(table)
}

const freeTables = computed(() => allTables.value.filter((table) => table.primary_status === 'free'))
// Nothing configured anywhere yet (not "this zone is empty" — the whole
// restaurant) — every operational panel would just be a wall of empty
// states in that case, so the onboarding card replaces them instead.
const hasAnyTables = computed(() => allTables.value.length > 0)
const shellStage = useShellStage()
const stageMode = computed(() => showScene.value && hasAnyTables.value && !!props.snapshot)
watch(stageMode, active => shellStage.set(active), { immediate: true })
onBeforeUnmount(() => shellStage.set(false))
const timezone = computed(() => props.snapshot?.restaurant.timezone ?? 'Europe/Madrid')

/** Tables whose session began before the current operational day — labelled, never hidden (utils/operation-timing.ts). */
const previousSessionTableIds = computed<ReadonlySet<number>>(() => {
  const snapshot = props.snapshot
  if (!snapshot) return new Set()
  return new Set(
    allTables.value
      .filter((table) => table.session && classifyOperationAge(table.session.elapsed_seconds, snapshot.generated_at, snapshot.daily_operation).kind === 'previous')
      .map((table) => table.id),
  )
})

const selectedSessionTiming = computed(() => {
  const snapshot = props.snapshot
  const session = selectedTable.value?.session
  if (!snapshot || !session) return null
  return classifyOperationAge(session.elapsed_seconds, snapshot.generated_at, snapshot.daily_operation)
})

const kitchenOldest = computed(() => {
  const snapshot = props.snapshot
  if (!snapshot || snapshot.kitchen.oldest_active_order_age_seconds === null) return null
  return classifyOperationAge(snapshot.kitchen.oldest_active_order_age_seconds, snapshot.generated_at, snapshot.daily_operation)
})

const dayNotOpen = computed(() => props.snapshot?.daily_operation.status === 'not_open')
// Day not open + live sessions/orders = leftovers from an earlier session;
// say so explicitly instead of letting them read as today's service.
const leftover = computed(() => {
  const summary = props.snapshot?.summary
  if (!dayNotOpen.value || !summary || (summary.active_sessions === 0 && summary.orders.active === 0)) return null
  return t('operations.board.leftover', {
    tables: t('operations.board.leftoverTables', summary.active_sessions),
    orders: t('operations.board.leftoverOrders', summary.orders.active),
  })
})

// Four live indicators only. Revenue, trends and comparisons live in
// Analytics. There is no backend rule for "late orders" on the live read
// model, so that indicator is not computed here (see the delivery notes).
// Distinct tables with a current (not previous-session) alert: the ones that need someone now.
const tablesNeedingAttention = computed(() => {
  const snapshot = props.snapshot
  if (!snapshot) return 0
  return new Set(snapshot.alerts
    .filter(alert => alert.table_id !== null && classifyOperationAge(alert.age_seconds, snapshot.generated_at, snapshot.daily_operation).kind !== 'previous')
    .map(alert => alert.table_id)).size
})
const attentionCount = computed(() => props.snapshot?.alerts.filter(alert =>
  classifyOperationAge(alert.age_seconds, props.snapshot!.generated_at, props.snapshot!.daily_operation).kind !== 'previous',
).length ?? 0)

// Orders are counted as ORDERS (the live contract has no per-dish quantities), and the labels say so.
const statItems = computed(() => {
  if (!props.snapshot) return []
  const { summary } = props.snapshot
  const n = (value: number) => formatNumber(value, locale.value)
  return [
    {
      id: 'occupied-tables',
      label: t('operations.board.kpi.tables'),
      value: t('operations.board.kpi.tablesValue', { occupied: n(summary.tables.occupied), total: n(summary.tables.total) }),
      context: t('operations.board.kpi.tablesContext', { free: n(summary.tables.free), attention: n(tablesNeedingAttention.value) }),
    },
    { id: 'active-guests', label: t('operations.quick.activeGuests'), value: n(summary.active_guests) },
    {
      id: 'active-orders',
      label: t('operations.quick.activeOrders'),
      value: n(summary.orders.active),
      context: t('operations.board.kpi.activeOrdersContext', { approval: n(summary.orders.waiting_approval), ready: n(summary.orders.ready) }),
    },
    {
      id: 'pending-requests',
      label: t('operations.board.kpi.requests'),
      value: n(summary.requests.pending),
      context: t('operations.board.kpi.requestsContext'),
    },
  ]
})

const floorSummary = computed(() => {
  const summary = props.snapshot?.summary
  if (!summary) return ''
  return t('operations.board.floor.summary', {
    occupied: formatNumber(summary.tables.occupied, locale.value),
    total: formatNumber(summary.tables.total, locale.value),
    guests: t('operations.board.queue.guests', summary.active_guests),
  })
})

const recentActivity = useRecentActivity(
  () => props.restaurantId,
  () => canViewActivity.value && !!props.snapshot,
  () => props.snapshot?.generated_at ?? null,
  20,
)
const activityPanel = useActivityPanelToggle()

// Where focus was when a selection began (a list row, an alert's "see table"): closing the selection returns there, so a
// keyboard user is not dropped at the top of the page. A pointer tap on the room leaves nothing to return to.
let selectionOrigin: HTMLElement | null = null
function rememberSelectionOrigin(): void {
  if (selectedTableId.value !== null) return
  const active = document.activeElement
  selectionOrigin = active instanceof HTMLElement && active !== document.body ? active : null
}
function selectTable(table: OperationsTable): void {
  rememberSelectionOrigin()
  selectedTableId.value = table.id
  selectedAlertId.value = null
  detailsOpen.value = false
}

function selectAlert(alert: OperationsAlert): void {
  rememberSelectionOrigin()
  selectedAlertId.value = alert.id
  selectedTableId.value = alert.table_id
}

function clearSelection(): void {
  const hadSelection = selectedTableId.value !== null
  selectedTableId.value = null
  selectedAlertId.value = null
  detailsOpen.value = false
  const origin = selectionOrigin
  selectionOrigin = null
  if (hadSelection && origin) void nextTick(() => { if (origin.isConnected) origin.focus({ preventScroll: true }) })
}

// --- Selection → details modal ------------------------------------------------------------------------------------
// The room is a block of the page, not a stage: selecting a table (in 3D, Plan, the list, an alert) opens the one shared
// details modal at every width. The modal owns the table's data and actions; this view only owns which table is open.
const drawerTable = computed(() => detailsOpen.value ? selectedTable.value : null)
function onDrawerClose(): void { detailsOpen.value = false }
const outsideSceneCount = computed(() => tablesOutsideScene.value.length)

// Staff: three people first, the rest on demand — the shift summary above stays visible either way.
const STAFF_PREVIEW = 3
const staffExpanded = ref(false)
const staffTotals = computed(() => (props.snapshot?.staff ?? []).reduce(
  (sum, member) => ({
    tables: sum.tables + member.load.assigned_tables,
    guests: sum.guests + member.load.assigned_guests,
    pending: sum.pending + member.load.pending_attention,
  }),
  { tables: 0, guests: 0, pending: 0 },
))
const activityExpanded = ref(false)
const visibleActivity = computed(() => recentActivity.events.value.slice(0, activityExpanded.value ? 20 : 5))
const attentionOpen = ref(false)

type DashboardPanelId = 'kitchen' | 'activity' | 'staff'
type DashboardPanelColumn = 'left' | 'right'
interface DashboardPanelLayout {
  left: DashboardPanelId[]
  right: DashboardPanelId[]
  hidden: DashboardPanelId[]
  collapsed: DashboardPanelId[]
}
const PANEL_IDS: DashboardPanelId[] = ['kitchen', 'activity', 'staff']
const DEFAULT_PANEL_LAYOUT: DashboardPanelLayout = {
  left: ['staff'], right: ['kitchen', 'activity'], hidden: [], collapsed: [],
}
const panelLayout = ref<DashboardPanelLayout>(structuredClone(DEFAULT_PANEL_LAYOUT))
const panelsMenuOpen = ref(false)
const draggedPanelId = ref<DashboardPanelId | null>(null)
const panelDropTarget = ref<DashboardPanelColumn | null>(null)
const panelStorageKey = computed(() => {
  const userId = authStore.user?.id ?? authStore.authContext?.user.id
  return userId && props.restaurantId !== null
    ? `saloa:dashboard-panels:v1:user-${userId}:restaurant-${props.restaurantId}`
    : null
})

function normalizePanelLayout(value: unknown): DashboardPanelLayout {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_PANEL_LAYOUT)
  const candidate = value as Partial<DashboardPanelLayout>
  const validUnique = (items: unknown): DashboardPanelId[] => Array.isArray(items)
    ? items.filter((item, index): item is DashboardPanelId => PANEL_IDS.includes(item as DashboardPanelId) && items.indexOf(item) === index)
    : []
  const left = validUnique(candidate.left)
  const right = validUnique(candidate.right).filter(id => !left.includes(id))
  for (const id of PANEL_IDS) if (!left.includes(id) && !right.includes(id)) {
    (id === 'staff' ? left : right).push(id)
  }
  return {
    left,
    right,
    hidden: validUnique(candidate.hidden),
    collapsed: validUnique(candidate.collapsed),
  }
}

watch(panelStorageKey, (key) => {
  if (!key || typeof window === 'undefined') {
    panelLayout.value = structuredClone(DEFAULT_PANEL_LAYOUT)
    return
  }
  try {
    const saved = window.localStorage.getItem(key)
    panelLayout.value = saved ? normalizePanelLayout(JSON.parse(saved)) : structuredClone(DEFAULT_PANEL_LAYOUT)
  } catch {
    panelLayout.value = structuredClone(DEFAULT_PANEL_LAYOUT)
  }
}, { immediate: true })
watch([panelStorageKey, panelLayout], ([key, layout]) => {
  if (!key || typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(layout)) } catch { /* Local storage may be disabled; layout still works for this visit. */ }
}, { deep: true })

const availablePanels = computed<DashboardPanelId[]>(() => [
  ...(canViewKitchen.value ? ['kitchen' as const] : []),
  ...(canViewActivity.value ? ['activity' as const] : []),
  ...(canViewStaff.value ? ['staff' as const] : []),
])
const desktopColumnPanels = (column: DashboardPanelColumn) => panelLayout.value[column]
function panelVisible(id: DashboardPanelId): boolean {
  return availablePanels.value.includes(id) && !panelLayout.value.hidden.includes(id)
}
function panelTitle(id: DashboardPanelId): string {
  return id === 'kitchen' ? t('operations.kitchen.title') : id === 'activity' ? t('operations.board.activity.title') : t('operations.staff.title')
}
function panelColumn(id: DashboardPanelId): DashboardPanelColumn {
  return panelLayout.value.left.includes(id) ? 'left' : 'right'
}
function togglePanelCollapsed(id: DashboardPanelId): void {
  panelLayout.value.collapsed = panelLayout.value.collapsed.includes(id)
    ? panelLayout.value.collapsed.filter(item => item !== id)
    : [...panelLayout.value.collapsed, id]
}
function togglePanelVisibility(id: DashboardPanelId): void {
  panelLayout.value.hidden = panelLayout.value.hidden.includes(id)
    ? panelLayout.value.hidden.filter(item => item !== id)
    : [...panelLayout.value.hidden, id]
}
function movePanel(id: DashboardPanelId, direction: 'up' | 'down' | 'left' | 'right'): void {
  const currentColumn = panelColumn(id)
  const destination = direction === 'left' || direction === 'right' ? direction : currentColumn
  const current = [...panelLayout.value[currentColumn]]
  const index = current.indexOf(id)
  if (index >= 0) current.splice(index, 1)
  if (destination !== currentColumn) {
    panelLayout.value[currentColumn] = current
    panelLayout.value[destination] = [...panelLayout.value[destination].filter(item => item !== id), id]
    return
  }
  const nextIndex = Math.max(0, Math.min(current.length, index + (direction === 'up' ? -1 : 1)))
  current.splice(nextIndex, 0, id)
  panelLayout.value[currentColumn] = current
}
function startPanelDrag(event: DragEvent, panelId: string): void {
  if (!PANEL_IDS.includes(panelId as DashboardPanelId)) return
  draggedPanelId.value = panelId as DashboardPanelId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', panelId)
  }
}
function dropPanel(column: DashboardPanelColumn): void {
  const panelId = draggedPanelId.value
  if (!panelId) return
  const previous = panelColumn(panelId)
  const source = panelLayout.value[previous].filter(id => id !== panelId)
  if (previous !== column) panelLayout.value[previous] = source
  panelLayout.value[column] = [...panelLayout.value[column].filter(id => id !== panelId), panelId]
  draggedPanelId.value = null
  panelDropTarget.value = null
}
function endPanelDrag(): void {
  draggedPanelId.value = null
  panelDropTarget.value = null
}
function restorePanelLayout(): void {
  panelLayout.value = structuredClone(DEFAULT_PANEL_LAYOUT)
  panelsMenuOpen.value = false
}

// --- Live notifications ----------------------------------------------------------------------------------------------
// New entries of the snapshot's own `alerts` (refetched on every realtime event): same ids, tables and ages as the attention
// queue, so a notification can never disagree with the list it points to. See utils/operational-toast-queue.ts.
function formatAlertClock(alert: OperationsAlert): string | undefined {
  const snapshot = props.snapshot
  if (!snapshot) return undefined
  const occurredAt = Date.parse(snapshot.generated_at) - alert.age_seconds * 1000
  if (!Number.isFinite(occurredAt)) return undefined
  try {
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', timeZone: timezone.value }).format(occurredAt)
  } catch {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(occurredAt)
  }
}
function toastFor(alert: OperationsAlert): OperationalToast | null {
  const labelKey = operationsAlertTypeLabelKey(alert.type)
  const table = alert.table_id !== null ? allTables.value.find(candidate => candidate.id === alert.table_id) ?? null : null
  let detail: string | undefined
  if (table && alert.type === 'order_waiting_approval' && table.orders.waiting_approval > 0) detail = t('operations.board.queue.ordersWaiting', table.orders.waiting_approval)
  else if (table && alert.type === 'order_ready' && table.orders.ready > 0) detail = t('operations.board.queue.ordersReady', table.orders.ready)
  return {
    id: alert.id,
    tone: alert.severity,
    title: labelKey ? t(labelKey) : t('operations.now.genericAttention'),
    table: table?.name,
    time: formatAlertClock(alert),
    detail,
    action: table ? { label: t(`operations.board.queue.actions.${operationsAlertActionKey(alert.type)}`), run: () => selectAlert(alert) } : undefined,
  }
}
const toasts = useOperationalToasts({
  restaurantId: () => props.restaurantId,
  alerts: () => props.snapshot?.alerts ?? null,
  isCurrent: alert => !props.snapshot || classifyOperationAge(alert.age_seconds, props.snapshot.generated_at, props.snapshot.daily_operation).kind !== 'previous',
  toToast: toastFor,
})
function onToastAction(toast: OperationalToast): void {
  toast.action?.run()
  toasts.dismiss(toast.id)
}

// A resolved alert disappears from the next snapshot; drop its highlight
// (the table itself stays open in context).
watch(() => props.snapshot?.alerts, (alerts) => {
  if (selectedAlertId.value && !alerts?.some((alert) => alert.id === selectedAlertId.value)) selectedAlertId.value = null
})

/**
 * Carta 8.1B §16/§17/§18 — fires whenever either side changes, so it works
 * regardless of which arrives first: a `pendingTableId` for a restaurant
 * whose snapshot is already on screen opens immediately; one that arrives
 * before the (possibly just-switched-to) restaurant's snapshot waits for it
 * — DashboardView already nulls `snapshot` out during a restaurant switch
 * (see useRestaurantOperations), so this can never match the WRONG
 * restaurant's stale table list (§18 "evitar race"). Always emits once
 * settled, found or not, so the caller clears the query either way (§17
 * "limpar query/state inválido de forma segura") — never a dangling
 * `?table=` that silently does nothing on every future visit.
 */
watch(
  () => [props.snapshot, props.pendingTableId] as const,
  ([snapshot, pendingId]) => {
    if (pendingId == null || !snapshot) return
    const match = allTables.value.find((table) => table.id === pendingId)
    if (match) selectedTableId.value = match.id
    emit('pending-table-consumed')
  },
  { immediate: true },
)

function onDrawerRefresh(): void {
  emit('refresh')
}

function onEditorClose(): void {
  showEditor.value = false
  emit('refresh')
}

</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex flex-col gap-4" aria-busy="true" role="status">
      <span class="sr-only">{{ t('operations.loading') }}</span>
      <div class="h-24 rounded-saloa-lg bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      <div class="grid gap-4 xl:grid-cols-[23fr_54fr_23fr]">
        <div class="hidden h-[32rem] rounded-saloa-lg bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none xl:block" />
        <div class="h-[32rem] rounded-saloa-lg bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
        <div class="hidden h-[32rem] rounded-saloa-lg bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none xl:block" />
      </div>
    </div>

    <ASurface
      v-else-if="error"
      tone="container"
      radius="lg"
      role="alert"
      class="flex max-w-xl flex-col items-start gap-3 border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">
        {{
          error.kind === 'forbidden'
            ? t('operations.errors.forbidden')
            : error.kind === 'not_found'
              ? t('operations.errors.notFound')
              : error.kind === 'network'
                ? t('operations.errors.network')
                : t('operations.errors.generic')
        }}
      </p>
      <AButton v-if="error.kind !== 'forbidden' && error.kind !== 'not_found'" variant="secondary" size="sm" :loading="refreshing" @click="emit('refresh')">
        {{ t('operations.board.activity.retry') }}
      </AButton>
    </ASurface>

    <template v-else-if="snapshot">
      <div class="dashboard-enter flex flex-col gap-3">
        <!-- Closed day: one compact strip, the page's only primary action. -->
        <div
          v-if="dayNotOpen"
          role="status"
          class="flex flex-col gap-3 rounded-saloa-lg border border-warning/40 bg-warning-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex min-w-0 items-start gap-3">
            <PhCalendarX :size="20" class="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div class="min-w-0">
              <p class="text-body-sm font-semibold text-fg">{{ t('dailyOperation.notOpen') }}</p>
              <p class="text-body-sm text-fg-muted">
                {{ t('dailyOperation.notOpenStaff') }}
                <strong v-if="leftover" class="font-semibold text-fg">{{ leftover }}</strong>
              </p>
            </div>
          </div>
          <AButton v-if="canManageDailyOperation" as="RouterLink" :to="{ name: 'app-day-close' }" size="sm" class="shrink-0">
            {{ t('dailyOperation.goToOpen') }}
          </AButton>
        </div>

        <RestaurantOnboarding
          v-if="!hasAnyTables"
          :total-tables="allTables.length"
          :can-manage-floor-plan="canManageFloorPlan"
          @open-floor-editor="openFloorEditor"
        />

        <div v-else ref="board" class="@container min-w-0">
          <!-- The room remains the backdrop. Operational cards occupy the side columns on wide screens and return to normal page flow on phones. -->
          <div class="operation-board relative min-w-0" :class="{ 'has-selection': selectedTableId !== null, 'is-panel-dragging': draggedPanelId !== null }">
            <section class="operation-board-floor min-w-0" aria-labelledby="dashboard-tables-title">
              <h2 id="dashboard-tables-title" class="sr-only">{{ t('operations.board.floor.title') }} · {{ floorSummary }}</h2>
              <div class="floor-controls" role="group" :aria-label="t('operations.board.floor.title')">
                <FloorViewSwitch :model-value="floorView" :three-d-enabled="threeDEnabled" @update:model-value="setFloorView" />
                <SceneCameraTools v-if="showScene && sceneReady" />
                <AButton v-if="canManageFloorPlan" class="floor-edit-button" variant="secondary" size="sm" @click="openFloorEditor">
                  <template #leading><PhPencilSimple /></template>{{ t('operations.floorMap.edit') }}
                </AButton>
                <div class="relative">
                  <AButton variant="secondary" size="sm" :aria-expanded="panelsMenuOpen" @click="panelsMenuOpen = !panelsMenuOpen">
                    {{ t('operations.board.panels.title') }}
                  </AButton>
                  <div v-if="panelsMenuOpen" class="panels-menu absolute right-0 top-full z-20 mt-2 flex min-w-56 flex-col rounded-saloa-md border border-hairline bg-surface p-2 shadow-raised" :aria-label="t('operations.board.panels.title')">
                    <label v-for="id in availablePanels" :key="id" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-saloa-sm px-2 text-body-sm text-fg hover:bg-surface-subtle">
                      <input type="checkbox" class="size-4 accent-primary" :checked="panelVisible(id)" @change="togglePanelVisibility(id)" />
                      <span>{{ panelTitle(id) }}</span>
                    </label>
                    <div class="my-1 border-t border-hairline" />
                    <button type="button" class="min-h-11 rounded-saloa-sm px-2 text-left text-body-sm font-medium text-fg hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" @click="restorePanelLayout">{{ t('operations.board.panels.restore') }}</button>
                  </div>
                </div>
              </div>

              <template v-if="showScene">
                <div class="floor-stage" data-floor-stage>
                  <div class="absolute inset-0">
                    <SceneRuntimeGuard v-if="sceneReady" :key="`${layoutRevision}-${sceneAttempt}`" @failed="onSceneFailed">
                      <RestaurantScene
                        :layout="sceneLayout!"
                        :entrance="sceneLayout!.entrance"
                        :restaurant-id="restaurantId"
                        :operations-snapshot="snapshot"
                        :selected-layout-table-id="selectedSceneTableId"
                        :environment="sceneMode === 'ultimate' ? 'ultimate' : 'kaykit'"
                        :diagnostics="false"
                        stage
                        @table-selected="selectSceneTable"
                      />
                    </SceneRuntimeGuard>
                    <div v-else class="grid h-full place-items-center p-4">
                      <div class="flex max-w-sm flex-col items-start gap-3 rounded-saloa-lg border border-hairline bg-surface p-4" :role="sceneUnavailable ? 'alert' : 'status'">
                        <p class="text-body-sm text-fg">
                          {{ sceneUnavailable ? sceneFailureMessage : layoutState === 'ready' ? t('operations.board.floor.sceneEmpty') : t('operations.board.floor.sceneLoading') }}
                        </p>
                        <div v-if="sceneUnavailable" class="flex flex-wrap gap-2">
                          <AButton v-if="sceneRetryAction" variant="secondary" size="sm" @click="sceneRetryAction">{{ t('operations.board.activity.retry') }}</AButton>
                          <AButton variant="secondary" size="sm" @click="showPlan">{{ t('operations.board.floor.showPlan') }}</AButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <details class="group border-t border-hairline px-4">
                  <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                    <PhCaretRight :size="16" class="text-fg-muted transition-transform duration-base ease-out group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    {{ t('operations.board.stage.tables', { count: formatNumber(allTables.length, locale) }) }}
                  </summary>
                  <p v-if="outsideSceneCount" class="mb-2 text-label-md text-fg-muted">{{ t('operations.board.stage.outsideCount', { count: formatNumber(outsideSceneCount, locale) }) }}</p>
                  <div class="pb-3">
                    <DashboardTableOverview :tables="allTables" :selected-table-id="selectedTableId" :previous-session-table-ids="previousSessionTableIds" @select="selectTable" />
                  </div>
                </details>
              </template>

              <div v-else class="min-w-0 flex-1 p-4">
                <RestaurantFloorMap
                  v-if="showFloorMap"
                  :floors="snapshot.floors"
                  :unassigned-tables="snapshot.unassigned_tables"
                  :selected-table-id="selectedTableId"
                  :previous-session-table-ids="previousSessionTableIds"
                  @select-table="selectTable"
                />
                <DashboardTableOverview v-else :tables="allTables" :selected-table-id="selectedTableId" :previous-session-table-ids="previousSessionTableIds" @select="selectTable" />

                <details class="group mt-3">
                  <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                    <PhCaretRight :size="16" class="text-fg-muted transition-transform duration-base ease-out group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    {{ t('operations.capacity.title') }}
                  </summary>
                  <div class="pb-1 pl-6">
                    <CapacityPanel :tables="allTables" :active-guests="snapshot.summary.active_guests" />
                  </div>
                </details>
              </div>
              <div class="dashboard-bottom-bar" data-dashboard-bottom-tools>
                <div class="dashboard-bottom-legend"><StageLegend /></div>
                <div class="dashboard-bottom-actions">
                <QuickActions :refreshing="refreshing" :can-manage-floor-plan="canManageFloorPlan" @edit-floor-plan="openFloorEditor" @refresh="emit('refresh')" />
                  <div class="attention-control" data-panel="attention">
                  <AButton variant="secondary" size="sm" :aria-expanded="attentionOpen" @click="attentionOpen = !attentionOpen">
                    {{ t('operations.board.queue.title') }} <span class="ml-1 rounded-full bg-warning-subtle px-2 py-0.5 text-label-md text-warning">{{ attentionCount }}</span>
                  </AButton>
                  </div>
                </div>
              </div>
            </section>

            <section class="operation-metrics" :aria-label="t('operations.quick.title')">
              <AStatStrip :items="statItems" compact />
            </section>

            <div class="operation-board-column operation-board-left" role="region" :aria-label="t('operations.board.panels.leftColumn')" :class="{ 'is-drop-target': panelDropTarget === 'left' }" @dragover.prevent="panelDropTarget = 'left'" @dragleave="panelDropTarget = null" @drop.prevent="dropPanel('left')">
              <p v-if="panelDropTarget === 'left'" class="drop-indicator" aria-live="polite">{{ t('operations.board.panels.dropHere') }}</p>
              <template v-for="(id, index) in desktopColumnPanels('left')" :key="id">
                <DashboardPanelCard v-if="panelVisible(id)" :panel-id="id" :title="panelTitle(id)" :collapsed="panelLayout.collapsed.includes(id)" column="left" :show-move-up="index > 0" :show-move-down="index < desktopColumnPanels('left').length - 1" :drag-active="draggedPanelId === id" @collapse="togglePanelCollapsed(id)" @close="togglePanelVisibility(id)" @move="movePanel(id, $event)" @dragstart="startPanelDrag" @dragend="endPanelDrag">
                  <template v-if="id === 'staff'">
                    <p v-if="snapshot.staff.length" class="mb-3 text-body-sm tabular-nums text-fg-muted" data-staff-summary>
                      {{ t('operations.board.staff.summary', { staff: formatNumber(snapshot.staff.length, locale), tables: formatNumber(staffTotals.tables, locale), guests: formatNumber(staffTotals.guests, locale) }) }}<template v-if="staffTotals.pending > 0"> · <strong class="font-semibold text-warning">{{ t('operations.board.staff.pending', staffTotals.pending) }}</strong></template>
                    </p>
                    <StaffLivePanel :staff="snapshot.staff" :generated-at="snapshot.generated_at" :daily-operation="snapshot.daily_operation" :timezone="timezone" :limit="staffExpanded ? snapshot.staff.length : STAFF_PREVIEW">
                      <template #more="{ hiddenCount }">
                        <AButton v-if="hiddenCount > 0 || staffExpanded" variant="ghost" size="sm" full-width class="mt-1" :aria-expanded="staffExpanded" @click="staffExpanded = !staffExpanded">
                          {{ staffExpanded ? t('operations.board.queue.showLess') : t('operations.board.staff.more', { count: hiddenCount }) }}
                        </AButton>
                      </template>
                    </StaffLivePanel>
                    <AButton as="RouterLink" :to="{ name: 'app-staff' }" variant="ghost" size="sm" class="mt-2 min-h-11 self-start">{{ t('operations.now.viewStaff') }}</AButton>
                  </template>
                  <section v-else-if="id === 'activity'" class="panel-content">
                    <RecentActivityPanel :events="visibleActivity" :loading="recentActivity.loading.value" :error="recentActivity.error.value" :timezone="timezone" @retry="recentActivity.retry" />
                    <div class="mt-2 flex flex-wrap gap-2">
                      <AButton v-if="recentActivity.events.value.length > 5" variant="ghost" size="sm" :aria-expanded="activityExpanded" @click="activityExpanded = !activityExpanded">
                        {{ activityExpanded ? t('operations.board.queue.showLess') : t('operations.board.activity.showMore') }}
                      </AButton>
                      <AButton variant="ghost" size="sm" @click="activityPanel.open()">{{ t('operations.board.activity.showAll') }}</AButton>
                    </div>
                  </section>
                  <template v-else>
                    <AButton as="RouterLink" :to="{ name: 'app-kitchen' }" variant="ghost" size="sm" class="-mt-2 mb-2 self-start whitespace-nowrap">
                      {{ t('operations.now.viewKitchen') }}<template #trailing><PhCaretRight /></template>
                    </AButton>
                    <KitchenLivePanel :orders="snapshot.summary.orders" :counts="snapshot.kitchen.counts_by_status" :oldest="kitchenOldest" :timezone="timezone" />
                  </template>
                </DashboardPanelCard>
              </template>
            </div>

            <div class="operation-board-column operation-board-right" role="region" :aria-label="t('operations.board.panels.rightColumn')" :class="{ 'is-drop-target': panelDropTarget === 'right' }" @dragover.prevent="panelDropTarget = 'right'" @dragleave="panelDropTarget = null" @drop.prevent="dropPanel('right')">
              <p v-if="panelDropTarget === 'right'" class="drop-indicator" aria-live="polite">{{ t('operations.board.panels.dropHere') }}</p>
              <template v-for="(id, index) in desktopColumnPanels('right')" :key="id">
                <DashboardPanelCard v-if="panelVisible(id)" :panel-id="id" :title="panelTitle(id)" :collapsed="panelLayout.collapsed.includes(id)" column="right" :show-move-up="index > 0" :show-move-down="index < desktopColumnPanels('right').length - 1" :drag-active="draggedPanelId === id" @collapse="togglePanelCollapsed(id)" @close="togglePanelVisibility(id)" @move="movePanel(id, $event)" @dragstart="startPanelDrag" @dragend="endPanelDrag">
                  <template v-if="id === 'staff'">
                    <p v-if="snapshot.staff.length" class="mb-3 text-body-sm tabular-nums text-fg-muted" data-staff-summary>
                      {{ t('operations.board.staff.summary', { staff: formatNumber(snapshot.staff.length, locale), tables: formatNumber(staffTotals.tables, locale), guests: formatNumber(staffTotals.guests, locale) }) }}<template v-if="staffTotals.pending > 0"> · <strong class="font-semibold text-warning">{{ t('operations.board.staff.pending', staffTotals.pending) }}</strong></template>
                    </p>
                    <StaffLivePanel :staff="snapshot.staff" :generated-at="snapshot.generated_at" :daily-operation="snapshot.daily_operation" :timezone="timezone" :limit="staffExpanded ? snapshot.staff.length : STAFF_PREVIEW">
                      <template #more="{ hiddenCount }"><AButton v-if="hiddenCount > 0 || staffExpanded" variant="ghost" size="sm" full-width class="mt-1" :aria-expanded="staffExpanded" @click="staffExpanded = !staffExpanded">{{ staffExpanded ? t('operations.board.queue.showLess') : t('operations.board.staff.more', { count: hiddenCount }) }}</AButton></template>
                    </StaffLivePanel>
                    <AButton as="RouterLink" :to="{ name: 'app-staff' }" variant="ghost" size="sm" class="mt-2 min-h-11 self-start">{{ t('operations.now.viewStaff') }}</AButton>
                  </template>
                  <section v-else-if="id === 'activity'" class="panel-content">
                    <RecentActivityPanel :events="visibleActivity" :loading="recentActivity.loading.value" :error="recentActivity.error.value" :timezone="timezone" @retry="recentActivity.retry" />
                    <div class="mt-2 flex flex-wrap gap-2">
                      <AButton v-if="recentActivity.events.value.length > 5" variant="ghost" size="sm" :aria-expanded="activityExpanded" @click="activityExpanded = !activityExpanded">{{ activityExpanded ? t('operations.board.queue.showLess') : t('operations.board.activity.showMore') }}</AButton>
                      <AButton variant="ghost" size="sm" @click="activityPanel.open()">{{ t('operations.board.activity.showAll') }}</AButton>
                    </div>
                  </section>
                  <template v-else>
                    <AButton as="RouterLink" :to="{ name: 'app-kitchen' }" variant="ghost" size="sm" class="-mt-2 mb-2 self-start whitespace-nowrap">{{ t('operations.now.viewKitchen') }}<template #trailing><PhCaretRight /></template></AButton>
                    <KitchenLivePanel :orders="snapshot.summary.orders" :counts="snapshot.kitchen.counts_by_status" :oldest="kitchenOldest" :timezone="timezone" />
                  </template>
                </DashboardPanelCard>
              </template>
            </div>

            <div v-if="attentionOpen" class="attention-panel" data-panel="attention">
                <AttentionQueue
                  class="min-h-0 flex-1"
                  :alerts="snapshot.alerts"
                  :tables="allTables"
                  :staff="snapshot.staff"
                  :generated-at="snapshot.generated_at"
                  :daily-operation="snapshot.daily_operation"
                  :timezone="timezone"
                  :selected-alert-id="selectedAlertId"
                  :can-view-service="canViewService"
                  compact dense
                  @select="selectAlert"
                />
            </div>

            <section v-if="selectedTable" class="selected-table-context rounded-saloa-lg border border-hairline bg-surface p-4 shadow-raised" aria-labelledby="selected-table-context-title" data-panel="selected-table">
                <header class="mb-2 flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h2 id="selected-table-context-title" class="text-component-title font-semibold text-fg">{{ selectedTable.name }}</h2>
                    <p class="text-label-md text-fg-muted">{{ t(`operations.tableStatus.${selectedTable.primary_status}`) }}</p>
                  </div>
                  <AButton variant="ghost" size="sm" :aria-label="t('operations.board.stage.table.close')" @click="clearSelection">{{ t('common.close') }}</AButton>
                </header>
                <p v-if="selectedTable.session" class="text-body-sm text-fg-muted">
                  {{ t('tableDrawer.guests') }}: <strong class="font-semibold text-fg">{{ selectedTable.session.guest_count }}</strong>
                  <span v-if="selectedTable.session.assigned_waiter"> · {{ selectedTable.session.assigned_waiter.name }}</span>
                </p>
                <p class="mt-1 text-body-sm text-fg-muted">
                  {{ t('operations.board.queue.ordersWaiting', selectedTable.orders.waiting_approval) }} · {{ t('operations.board.queue.ordersReady', selectedTable.orders.ready) }}
                </p>
                <AButton variant="secondary" size="sm" full-width class="mt-3" @click="detailsOpen = true">{{ t('operations.board.stage.table.manage') }}</AButton>
            </section>
          </div>
        </div>
      </div>

      <OperationalToastHost
        :toasts="toasts.visible.value"
        :waiting="toasts.waiting.value"
        @dismiss="toasts.dismiss"
        @pause="toasts.pause"
        @resume="toasts.resume"
        @action="onToastAction"
      />
    </template>

    <EmptyState v-else :icon="PhTable" :message="t('operations.noData')" />

    <!-- Full table actions stay in the reorganised shared modal; the compact context remains visible beneath it. -->
    <TableDetailsDrawer
      :table="drawerTable"
      :staff="snapshot?.staff ?? []"
      :free-tables="freeTables"
      :currency="snapshot?.restaurant.currency ?? 'EUR'"
      dashboard-mode
      :session-timing="selectedSessionTiming"
      @close="onDrawerClose"
      @refresh="onDrawerRefresh"
    />

    <FloorMapEditor
      v-if="showEditor && canManageFloorPlan"
      :restaurant-id="restaurantId"
      :last-realtime-event="lastRealtimeEvent"
      @close="onEditorClose"
    />
  </div>
</template>

<style scoped>
/* Mobile uses the restaurant as the backdrop and puts the cards into natural page flow. */
.floor-stage { position: relative; height: clamp(28rem, 58dvh, 36rem); min-height: 28rem; background: var(--color-surface-subtle); overflow: hidden; touch-action: pan-y; }
.operation-board-floor { position: relative; min-width: 0; order: 0; }
.operation-board { display: flex; flex-direction: column; gap: 0.75rem; padding-bottom: 5.75rem; }
.floor-controls { position: absolute; z-index: 5; top: 5.5rem; left: 0.75rem; right: 0.75rem; display: flex; align-items: center; justify-content: flex-start; gap: 0.375rem; overflow-x: auto; scrollbar-width: none; }
.floor-controls::-webkit-scrollbar { display: none; }
.floor-controls > * { flex: 0 0 auto; }
.floor-controls > .relative > button { white-space: nowrap; }
.floor-edit-button { display: none; }
.floor-controls :deep([role='radiogroup']) { min-height: 2.75rem; padding: 0.125rem; }
.floor-controls :deep([role='radiogroup'] button) { min-height: 2.5rem; min-width: 2.75rem; }
.dashboard-bottom-bar { position: absolute; z-index: 5; right: 0.75rem; bottom: 0.75rem; left: 0.75rem; display: flex; align-items: end; justify-content: space-between; gap: 0.5rem; }
.dashboard-bottom-legend { display: none; }
.dashboard-bottom-actions { display: contents; }
.dashboard-bottom-actions .attention-control { margin-left: auto; }
.dashboard-bottom-actions .attention-control :deep(button) { white-space: nowrap; }
.dashboard-bottom-actions .attention-control :deep(.a-control-label) { white-space: nowrap; }
.operation-metrics { position: absolute; z-index: 4; top: 0.5rem; left: 0.5rem; right: 0.5rem; }
.operation-metrics :deep(.a-stat-strip) { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.375rem; padding: 0; border: 0; background: transparent; }
.operation-metrics :deep(.a-stat-strip > div) { min-width: 0; padding: 0.375rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-surface) 92%, transparent); box-shadow: var(--elevation-raised); }
.operation-metrics :deep(.a-stat-strip > div > dt) { font-size: 0.62rem; line-height: 1.15; }
.operation-metrics :deep(.a-stat-strip > div > dd:first-of-type) { font-size: var(--text-title-md); line-height: 1.2; }
.operation-metrics :deep(.a-stat-strip > div > dd:nth-of-type(2)) { display: none; }
.operation-board-column { display: flex; min-width: 0; flex-direction: column; gap: 0.75rem; }
.operation-board-left, .operation-board-right { display: contents; }
.operation-board-side { display: contents; }
.dashboard-panel-card[data-panel='kitchen'] { order: 1; }
.selected-table-context { order: 2; }
.dashboard-panel-card[data-panel='staff'] { order: 3; }
.dashboard-panel-card[data-panel='activity'] { order: 4; }
.attention-panel { order: 5; max-height: 24rem; overflow: auto; }
.operation-board-floor > .border-t { display: none; }
.operation-board-floor > details { margin: 0.5rem 0; }
.panels-menu { max-height: min(70dvh, 24rem); overflow: auto; }

/* On desktop the full-bleed room occupies the middle; movable cards dock in the lower perimeter. */
@media (min-width: 1024px) {
  .dashboard-enter { position: relative; min-height: calc(100dvh - var(--bar-top, 0px)); }
  .operation-board { position: relative; display: block; height: calc(100dvh - var(--bar-top, 0px)); min-height: 42rem; padding: 0; }
  .operation-board-floor { position: absolute; inset: 0; }
  .floor-stage { position: absolute; inset: 0; height: auto; min-height: 0; background: var(--color-surface-subtle); }
  .floor-controls { top: 1.25rem; left: 50%; right: auto; width: max-content; max-width: 38vw; transform: translateX(-50%); justify-content: center; }
  .floor-edit-button { display: none; }
  .dashboard-bottom-bar { position: absolute; z-index: 5; right: auto; bottom: 1rem; left: 50%; display: flex; width: max-content; max-width: calc(100% - 44rem); transform: translateX(-50%); flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-surface) 94%, transparent); padding: 0.5rem 0.75rem; box-shadow: var(--elevation-raised); }
  .dashboard-bottom-legend { display: block; min-width: 0; flex: 1 1 34rem; }
  .dashboard-bottom-legend :deep(ul) { padding-top: 0; }
  .dashboard-bottom-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem; }
  .dashboard-bottom-actions :deep([role='group']) { flex-wrap: nowrap; }
  .dashboard-bottom-actions :deep(button) { white-space: nowrap; }
  .dashboard-bottom-actions .attention-control { margin-left: 0; }
  .operation-metrics { top: 1.25rem; right: auto; left: 1.25rem; width: 28rem; }
  .operation-metrics :deep(.a-stat-strip) { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
  .operation-metrics :deep(.a-stat-strip > div) { min-height: 4.5rem; padding: 0.625rem; background: var(--color-surface); }
  .operation-metrics :deep(.a-stat-strip > div > dt) { font-size: 0.68rem; }
  .operation-metrics :deep(.a-stat-strip > div > dd:first-of-type) { font-size: var(--text-title-lg); }
  .operation-board-column { position: absolute; z-index: 3; top: 7.25rem; bottom: 8.5rem; display: flex; width: 19rem; flex-direction: column; justify-content: flex-end; overflow: auto; gap: 0.75rem; pointer-events: auto; }
  .operation-board-left, .operation-board-right { display: flex; }
  .operation-board-left { left: 1.25rem; }
  .operation-board-right { right: 1.25rem; width: 20rem; }
  .operation-board-column > * { pointer-events: auto; }
  .operation-board.is-panel-dragging .operation-board-column { pointer-events: auto; }
  .operation-board-column.is-drop-target { outline: 2px dashed var(--color-focus); outline-offset: 4px; border-radius: var(--radius-lg); }
  .operation-board-column .dashboard-panel-card { width: 100%; max-height: 100%; flex: 0 0 auto; }
  .operation-board-right .dashboard-panel-card { max-height: calc((100% - 0.75rem) / 2); }
  .operation-board-column .dashboard-panel-body { overscroll-behavior: contain; }
  .operation-board-left .dashboard-panel-card[data-panel='staff'] { order: initial; }
  .operation-board-right .dashboard-panel-card[data-panel='kitchen'], .operation-board-right .dashboard-panel-card[data-panel='activity'] { order: initial; }
  .drop-indicator { position: sticky; top: 0; z-index: 6; display: block; margin-bottom: -3.25rem; min-height: 3rem; border: 2px dashed var(--color-focus); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-surface) 90%, transparent); padding: 0.75rem; color: var(--color-fg); text-align: center; }
  .selected-table-context { position: absolute; z-index: 3; left: 50%; bottom: 8.5rem; width: 20rem; max-height: 26%; overflow: auto; transform: translateX(-50%); }
  .attention-panel { position: absolute; z-index: 6; left: 50%; right: auto; bottom: 8.5rem; width: 20rem; max-height: 40%; overflow: auto; transform: translateX(-50%); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--elevation-raised); }
  .operation-board-floor > .border-t { display: none; }
  .operation-board-floor > details { display: none; }
  .operation-board-side { display: contents; }
}
@media (min-width: 1280px) {
  .operation-metrics { left: 1.5rem; top: 1.25rem; width: 28rem; }
  .operation-board-left { left: 1.5rem; width: 20rem; }
  .operation-board-right { right: 1.5rem; width: 21rem; }
}
@media (min-width: 1024px) and (max-width: 1439px) {
  .floor-controls { top: 1.25rem; left: auto; right: 1.5rem; width: max-content; max-width: calc(100% - 31rem); flex-wrap: wrap; transform: none; justify-content: center; }
  .floor-edit-button { display: none; }
}
@media (min-width: 1800px) {
  .operation-metrics { width: 28rem; }
  .operation-board-left { width: 21rem; }
  .operation-board-right { width: 23rem; }
}
@media (max-width: 380px) {
  .operation-metrics :deep(.a-stat-strip > div) { padding: 0.25rem; }
  .operation-metrics :deep(.a-stat-strip > div > dt) { font-size: 0.56rem; }
  .operation-metrics :deep(.a-stat-strip > div > dd:first-of-type) { font-size: 1.05rem; }
  .dashboard-bottom-actions :deep(button) { font-size: 0.72rem; }
}

/* SALOA §10.2 generic entrance: first paint only, opacity + 4px rise; nothing moves when motion is reduced. */
@media (prefers-reduced-motion: no-preference) {
  .dashboard-enter { animation: dashboard-enter var(--duration-base) var(--ease-out) both; }
}
@keyframes dashboard-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
</style>
