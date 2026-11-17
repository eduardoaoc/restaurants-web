<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalendarX, PhCaretRight, PhCrosshairSimple, PhPencilSimple, PhTable } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AStatStrip from '@/components/dashboard/AStatStrip.vue'
import RestaurantOnboarding from '@/components/dashboard/RestaurantOnboarding.vue'
import AttentionQueue from '@/components/dashboard/operation/AttentionQueue.vue'
import CapacityPanel from '@/components/dashboard/operation/CapacityPanel.vue'
import DashboardTableOverview from '@/components/dashboard/operation/DashboardTableOverview.vue'
import FloorMapEditor from '@/components/dashboard/operation/FloorMapEditor.vue'
import KitchenLivePanel from '@/components/dashboard/operation/KitchenLivePanel.vue'
import RecentActivityPanel from '@/components/dashboard/operation/RecentActivityPanel.vue'
import RestaurantFloorMap from '@/components/dashboard/operation/RestaurantFloorMap.vue'
import StaffLivePanel from '@/components/dashboard/operation/StaffLivePanel.vue'
import StageLegend from '@/components/dashboard/operation/stage/StageLegend.vue'
import StageStatCards from '@/components/dashboard/operation/stage/StageStatCards.vue'
import StageTableCard from '@/components/dashboard/operation/stage/StageTableCard.vue'
import StageTopbar from '@/components/dashboard/operation/stage/StageTopbar.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import { sceneCommands } from '@/components/restaurant-3d/scene-commands'
import ASurface from '@/components/ui/ASurface.vue'
import { useActivityPanelToggle } from '@/composables/useActivityPanelToggle'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantFloorLayout } from '@/composables/useRestaurantFloorLayout'
import { useRecentActivity } from '@/composables/useRecentActivity'
import '@/components/dashboard/operation/stage/stage.css'
import { useShellStage } from '@/composables/useShellStage'
import { appConfig } from '@/config/runtime'
import type { Dashboard3DMode } from '@/config/env'
import SceneRuntimeGuard from '@/components/restaurant-3d/SceneRuntimeGuard.vue'
import { supportsWebGL, type SceneFailureReason } from '@/components/restaurant-3d/scene-runtime-guard'
import type { RealtimeConnectionState } from '@/types/realtime'
import { formatDateOnly } from '@/utils/format'
import { SERVICE_ACCESS_PERMISSIONS } from '@/types/auth-context'
import type { OperationsAlert, OperationsLiveSnapshot, OperationsTable } from '@/types/operations'
import type { ReceivedRealtimeEvent } from '@/composables/useRestaurantRealtime'
import { formatNumber } from '@/utils/format'
import { classifyOperationAge } from '@/utils/operation-timing'

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

const canManageFloorPlan = computed(() => can('manage_floor_plan'))
const canViewService = computed(() => canAny(SERVICE_ACCESS_PERMISSIONS))
const canViewKitchen = computed(() => canAny(['update_kitchen_status', 'serve_orders']))
const canViewStaff = computed(() => can('manage_users'))
const canViewActivity = computed(() => can('view_activity'))
const canManageDailyOperation = computed(() => can('open_daily_operation') || can('close_daily_operation'))
const hasSidePanels = computed(() => canViewKitchen.value || canViewStaff.value || canViewActivity.value)

const selectedTableId = ref<number | null>(null)
const selectedAlertId = ref<string | null>(null)
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
const compactQueue = computed(() => boardWidth.value < 896)

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
const statItems = computed(() => {
  if (!props.snapshot) return []
  const { summary } = props.snapshot
  const n = (value: number) => formatNumber(value, locale.value)
  return [
    {
      id: 'occupied-tables',
      label: t('operations.board.kpi.occupiedTables'),
      value: `${n(summary.tables.occupied)} / ${n(summary.tables.total)}`,
      context: t('operations.quick.occupancyContext', { percent: Math.round(summary.tables.occupancy_rate * 100) }),
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
const sidePanelEvents = computed(() => recentActivity.events.value.slice(0, 6))
const selectedTableEvents = computed(() => selectedTableId.value === null
  ? []
  : recentActivity.events.value.filter(event => event.table?.id === selectedTableId.value).slice(0, 4))
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
  const origin = selectionOrigin
  selectionOrigin = null
  if (hadSelection && origin) void nextTick(() => { if (origin.isConnected) origin.focus({ preventScroll: true }) })
}
function recenterScene(): void { sceneCommands.recenter++ }

// --- Dashboard stage (3D room as the page background) -----------------------------------------------------------
// Presentation only: same snapshot, same selection, same details sheet and actions as the Plan view.
const shellStage = useShellStage()
const stageMode = computed(() => showScene.value && hasAnyTables.value && !!props.snapshot)
watch(stageMode, active => shellStage.set(active), { immediate: true })
onBeforeUnmount(() => shellStage.set(false))

// Wide arrangement (floating card + both docks) needs room in both directions: a phone in landscape is not wide.
const wideMedia = window.matchMedia('(min-width: 768px) and (min-height: 521px)')
const wide = ref(wideMedia.matches)
const onWideChange = (): void => { wide.value = wideMedia.matches }
wideMedia.addEventListener('change', onWideChange)
onBeforeUnmount(() => wideMedia.removeEventListener('change', onWideChange))

// Wide: the selection opens a card over the room (non-modal) and the full details sheet only on "Manage table".
// Narrow: the selection opens the existing responsive sheet directly.
const detailsOpen = ref(false)
const stageCardVisible = computed(() => stageMode.value && wide.value && !!selectedTable.value)
const drawerTable = computed(() => stageCardVisible.value && !detailsOpen.value ? null : selectedTable.value)
function onDrawerClose(): void {
  if (stageCardVisible.value) detailsOpen.value = false
  else clearSelection()
}
watch(selectedTableId, () => { detailsOpen.value = false })
function onStageEscape(): void {
  if (selectedTableId.value !== null && !detailsOpen.value) clearSelection()
}
const mobilePanel = ref<'attention' | 'tables' | null>(null)
const stageStats = computed(() => statItems.value.map(item => ({ ...item, context: item.id === 'occupied-tables' ? item.context : undefined })))
const dayState = computed(() => {
  const daily = props.snapshot?.daily_operation
  if (!daily) return null
  return daily.status === 'open'
    ? { open: true, label: t('operations.board.dayOpen', { date: formatDateOnly(daily.business_date, locale.value) }) }
    : { open: false, label: t('operations.board.dayNotOpen') }
})
const attentionCount = computed(() => props.snapshot?.alerts.length ?? 0)
const outsideSceneCount = computed(() => tablesOutsideScene.value.length)

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

const panelClass = 'flex min-w-0 flex-col rounded-saloa-lg border border-hairline bg-surface'
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
      <!-- Compact controls for the shell's top bar (view selector always; status, clock and refresh on the stage). -->
      <StageTopbar
        v-if="hasAnyTables"
        :floor-view="floorView"
        :three-d-enabled="threeDEnabled"
        :stage="stageMode"
        :day-state="dayState"
        :connection-state="connectionState"
        :refreshing="refreshing"
        :can-refresh="true"
        :can-view-reports="can('view_reports')"
        :timezone="timezone"
        @update:floor-view="setFloorView"
        @refresh="emit('refresh')"
      />

      <div v-if="!stageMode" class="dashboard-enter flex flex-col gap-4">
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

        <section :aria-label="t('operations.quick.title')">
          <AStatStrip :items="statItems" />
        </section>

        <RestaurantOnboarding
          v-if="!hasAnyTables"
          :total-tables="allTables.length"
          :can-manage-floor-plan="canManageFloorPlan"
          @open-floor-editor="openFloorEditor"
        />

        <div v-else ref="board" class="@container min-w-0">
          <div class="operation-board grid min-w-0 grid-cols-1 gap-4" :class="{ 'operation-board--side': hasSidePanels }">
            <!-- Left: attention queue. From @4xl its height follows the row and the list scrolls inside. -->
            <div class="operation-board-queue relative min-w-0">
              <div :class="[panelClass, '@4xl:absolute @4xl:inset-0']">
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
                  :compact="compactQueue"
                  @select="selectAlert"
                />
              </div>
            </div>

            <!-- Centre: the room, the board's primary object. -->
            <section class="operation-board-floor min-w-0" :class="panelClass" aria-labelledby="dashboard-tables-title">
              <header class="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-4 py-3">
                <div class="min-w-0">
                  <h2 id="dashboard-tables-title" class="text-component-title font-semibold text-fg">{{ t('operations.board.floor.title') }}</h2>
                  <p class="mt-0.5 text-body-sm tabular-nums text-fg-muted">{{ floorSummary }}</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <AButton v-if="canManageFloorPlan" variant="secondary" size="sm" @click="openFloorEditor">
                    <template #leading><PhPencilSimple /></template>{{ t('operations.floorMap.edit') }}
                  </AButton>
                </div>
              </header>

              <div class="min-w-0 flex-1 p-4">
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
            </section>

            <!-- Right: follow-up blocks, each under its existing route gate. -->
            <div v-if="hasSidePanels" class="operation-board-side grid min-w-0 grid-cols-1 content-start items-start gap-4">
              <section v-if="canViewKitchen" :class="panelClass" class="p-4" aria-labelledby="dashboard-kitchen-title">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 id="dashboard-kitchen-title" class="min-w-0 text-component-title font-semibold text-fg">{{ t('operations.kitchen.title') }}</h2>
                  <AButton as="RouterLink" :to="{ name: 'app-kitchen' }" variant="ghost" size="sm" class="-mr-2 shrink-0 whitespace-nowrap">
                    {{ t('operations.now.viewKitchen') }}
                    <template #trailing><PhCaretRight /></template>
                  </AButton>
                </div>
                <KitchenLivePanel :orders="snapshot.summary.orders" :oldest="kitchenOldest" :timezone="timezone" />
              </section>

              <section v-if="canViewStaff" :class="panelClass" class="p-4" aria-labelledby="dashboard-staff-title">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 id="dashboard-staff-title" class="min-w-0 text-component-title font-semibold text-fg">{{ t('operations.staff.title') }}</h2>
                  <AButton as="RouterLink" :to="{ name: 'app-staff' }" variant="ghost" size="sm" class="-mr-2 shrink-0 whitespace-nowrap">
                    {{ t('operations.now.viewStaff') }}
                    <template #trailing><PhCaretRight /></template>
                  </AButton>
                </div>
                <StaffLivePanel
                  :staff="snapshot.staff"
                  :generated-at="snapshot.generated_at"
                  :daily-operation="snapshot.daily_operation"
                  :timezone="timezone"
                >
                  <template #more="{ hiddenCount }">
                    <AButton v-if="hiddenCount > 0" as="RouterLink" :to="{ name: 'app-staff' }" variant="ghost" size="sm" full-width class="mt-1">
                      {{ t('operations.board.staff.more', { count: hiddenCount }) }}
                    </AButton>
                  </template>
                </StaffLivePanel>
              </section>

              <section v-if="canViewActivity" :class="panelClass" class="p-4" aria-labelledby="dashboard-activity-title">
                <h2 id="dashboard-activity-title" class="mb-3 text-component-title font-semibold text-fg">{{ t('operations.board.activity.title') }}</h2>
                <RecentActivityPanel
                  :events="sidePanelEvents"
                  :loading="recentActivity.loading.value"
                  :error="recentActivity.error.value"
                  :timezone="timezone"
                  @retry="recentActivity.retry"
                />
                <AButton variant="ghost" size="sm" full-width class="mt-2" @click="activityPanel.open()">
                  {{ t('operations.board.activity.viewAll') }}
                </AButton>
              </section>
            </div>
          </div>
        </div>
      </div>

      <!-- The room is the page: the 3D scene fills the whole area under the top bar and the panels float over its edges. -->
      <div v-else class="stage" @keydown.esc="onStageEscape">
        <h1 class="sr-only">{{ t('operations.board.title') }}</h1>
        <div class="stage-scene">
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
          <div v-else class="stage-scene-state">
            <div class="stage-panel flex max-w-sm flex-col items-start gap-3 rounded-saloa-lg p-4" :role="sceneUnavailable ? 'alert' : 'status'">
              <p class="text-body-sm text-fg">
                {{ sceneUnavailable ? sceneFailureMessage : t('operations.board.floor.sceneLoading') }}
              </p>
              <div v-if="sceneUnavailable" class="flex flex-wrap gap-2">
                <AButton v-if="sceneRetryAction" variant="secondary" size="sm" @click="sceneRetryAction">{{ t('operations.board.activity.retry') }}</AButton>
                <AButton variant="secondary" size="sm" @click="showPlan">{{ t('operations.board.floor.showPlan') }}</AButton>
              </div>
            </div>
          </div>
        </div>

        <div class="stage-ui">
          <div class="stage-row">
            <div class="stage-col stage-col--start">
              <StageStatCards :items="stageStats" />
              <div v-if="dayNotOpen" role="status" class="stage-panel flex items-center gap-2 rounded-saloa-lg px-3 py-2">
                <PhCalendarX :size="18" class="shrink-0 text-warning" aria-hidden="true" />
                <p class="min-w-0 flex-1 text-body-sm text-fg">{{ t('dailyOperation.notOpen') }}<strong v-if="leftover" class="block text-label-md font-semibold text-fg-muted">{{ leftover }}</strong></p>
                <AButton v-if="canManageDailyOperation" as="RouterLink" :to="{ name: 'app-day-close' }" size="sm" class="shrink-0">{{ t('dailyOperation.goToOpen') }}</AButton>
              </div>
            </div>
            <div class="stage-col stage-col--end stage-card-slot">
              <AButton class="stage-recenter self-end" variant="secondary" size="sm" @click="recenterScene">
                <template #leading><PhCrosshairSimple /></template>{{ t('floorLayout.recenterView') }}
              </AButton>
              <StageTableCard
                v-if="stageCardVisible && selectedTable"
                :table="selectedTable"
                :timing-previous="selectedSessionTiming?.kind === 'previous'"
                @close="clearSelection"
                @manage="detailsOpen = true"
              />
            </div>
          </div>

          <div class="stage-row stage-row--bottom">
            <!-- Bottom-left: legend, the selected table's activity and a keyboard/touch list of every table. -->
            <section class="stage-panel stage-dock stage-dock--start flex-col gap-0.5 rounded-saloa-lg px-3 py-1" :class="mobilePanel === 'tables' ? 'is-open' : ''" :aria-label="t('operations.board.stage.tablesPanel')">
              <StageLegend />
              <details v-if="selectedTable && canViewActivity" :key="selectedTable.id" class="group min-w-0">
                <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-label-lg font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                  <PhCaretRight :size="16" class="text-fg-muted transition-transform duration-base ease-out group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                  {{ t('operations.board.stage.table.history', { table: selectedTable.name }) }}
                </summary>
                <p v-if="selectedTableEvents.length === 0" class="mb-2 text-label-md text-fg-muted">{{ t('operations.board.stage.table.historyEmpty') }}</p>
                <div v-else class="mb-2 max-h-56 overflow-y-auto">
                  <RecentActivityPanel :events="selectedTableEvents" :loading="false" :error="null" :timezone="timezone" @retry="recentActivity.retry" />
                </div>
              </details>
              <details class="group min-w-0">
                <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-label-lg font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                  <PhCaretRight :size="16" class="text-fg-muted transition-transform duration-base ease-out group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                  {{ t('operations.board.stage.tables', { count: formatNumber(allTables.length, locale) }) }}
                </summary>
                <p v-if="outsideSceneCount" class="mb-2 text-label-md text-fg-muted">{{ t('operations.board.stage.outsideCount', { count: formatNumber(outsideSceneCount, locale) }) }}</p>
                <div class="max-h-56 overflow-y-auto p-1">
                  <DashboardTableOverview :tables="allTables" :selected-table-id="selectedTableId" :previous-session-table-ids="previousSessionTableIds" @select="selectTable" />
                </div>
              </details>
            </section>

            <!-- Bottom-right: the attention queue. -->
            <section class="stage-panel stage-dock stage-dock--end rounded-saloa-lg" :class="mobilePanel === 'attention' ? 'is-open' : ''" :aria-label="t('operations.board.queue.title')">
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
                compact
                dense
                @select="selectAlert"
              />
            </section>
          </div>

          <!-- Phones: the two bottom panels collapse into one dock of toggles so the room keeps the screen. -->
          <div class="stage-toggles" role="group" :aria-label="t('operations.board.stage.panels')">
            <AButton variant="secondary" size="sm" :aria-pressed="mobilePanel === 'attention'" @click="mobilePanel = mobilePanel === 'attention' ? null : 'attention'">
              {{ t('operations.board.queue.title') }} · {{ formatNumber(attentionCount, locale) }}
            </AButton>
            <AButton variant="secondary" size="sm" :aria-pressed="mobilePanel === 'tables'" @click="mobilePanel = mobilePanel === 'tables' ? null : 'tables'">
              {{ t('operations.board.stage.tablesShort') }}
            </AButton>
            <AIconButton variant="secondary" size="sm" :label="t('floorLayout.recenterView')" @click="recenterScene"><PhCrosshairSimple /></AIconButton>
          </div>
        </div>
      </div>
    </template>

    <EmptyState v-else :icon="PhTable" :message="t('operations.noData')" />

    <!-- Table details open in the shared centred modal at every width. -->
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
/*
 * Board composition (docs/design/dashboard-map.webp): queue | room | follow-up
 * at ~23/54/23 once the board is ≥1024px wide; queue | room with follow-up
 * below from 896px; a single stacked column under that. Container-based so
 * the shell's rail vs. expanded sidebar is accounted for.
 */
@container (min-width: 42rem) {
  .operation-board-side { grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); }
}
@container (min-width: 56rem) {
  .operation-board { grid-template-columns: minmax(16rem, 18rem) minmax(0, 1fr); }
  .operation-board-queue { grid-column: 1; grid-row: 1; }
  .operation-board-floor { grid-column: 2; grid-row: 1; }
  .operation-board-side { grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (min-width: 64rem) {
  .operation-board--side { grid-template-columns: minmax(15rem, 23fr) minmax(0, 54fr) minmax(15rem, 23fr); }
  .operation-board--side .operation-board-side { grid-column: 3; grid-row: 1; grid-template-columns: minmax(0, 1fr); }
}

/*
 * Dashboard stage: the 3D room fills the whole area under the shell's top bar (the shell goes full-bleed) and the
 * panels float over its corners — stats and selected table on top, legend/history and the attention queue below.
 * The containers never catch pointer events, so the room stays interactive everywhere between the panels.
 */
.stage { position: relative; isolation: isolate; height: calc(100dvh - var(--bar-top, 0px) - var(--bar-bottom, 0px)); min-height: 26rem; overflow: hidden; background: var(--color-background); }
.stage-scene { position: absolute; inset: 0; }
.stage-scene-state { display: grid; height: 100%; place-items: center; padding: 1rem; }
.stage-ui { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; padding: 0.75rem; pointer-events: none; }
.stage-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; min-height: 0; }
.stage-row--bottom { align-items: flex-end; }
.stage-col { display: flex; min-width: 0; flex-direction: column; gap: 0.5rem; pointer-events: none; }
.stage-col > * { pointer-events: auto; }
.stage-col--start { width: 100%; }
.stage-card-slot { display: none; }
.stage-dock { display: none; min-width: 0; pointer-events: auto; }
.stage-dock.is-open { display: flex; width: 100%; max-height: 50dvh; overflow-y: auto; }
.stage-toggles { display: flex; justify-content: center; gap: 0.5rem; pointer-events: auto; }
.stage-toggles button[aria-pressed='true'] { box-shadow: inset 0 0 0 1px currentColor; }

@media (min-width: 768px) and (min-height: 521px) {
  .stage-ui { padding: 1rem; }
  .stage-col--start { width: min(45rem, 100%); }
  .stage-card-slot { display: flex; width: 19rem; max-height: min(24rem, 100%); }
  .stage-dock, .stage-dock.is-open { display: flex; width: auto; }
  .stage-dock--start { width: min(28rem, calc(100% - 23.5rem)); max-height: min(24rem, 46dvh); overflow-y: auto; }
  .stage-dock--end { width: 22rem; max-height: min(22rem, 42dvh); flex-direction: column; }
  .stage-toggles { display: none; }
}

/* Short screens (a phone in landscape): the panels leave the room's view and the open dock may use most of the height. */
@media (max-height: 520px) {
  .stage { min-height: 0; }
  .stage-ui { gap: 0.5rem; padding: 0.5rem; }
  .stage-dock.is-open { max-height: 72dvh; }
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
