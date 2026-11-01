<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalendarX, PhCaretRight, PhPencilSimple, PhTable } from '@phosphor-icons/vue'

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
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useActivityPanelToggle } from '@/composables/useActivityPanelToggle'
import { usePermissions } from '@/composables/usePermissions'
import { useRecentActivity } from '@/composables/useRecentActivity'
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
)
const activityPanel = useActivityPanelToggle()

function selectTable(table: OperationsTable): void {
  selectedTableId.value = table.id
  selectedAlertId.value = null
}

function selectAlert(alert: OperationsAlert): void {
  selectedAlertId.value = alert.id
  selectedTableId.value = alert.table_id
}

function clearSelection(): void {
  selectedTableId.value = null
  selectedAlertId.value = null
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
      <div class="dashboard-enter flex flex-col gap-4">
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
          <div class="operation-board grid min-w-0 grid-cols-1 gap-4" :class="hasSidePanels ? 'operation-board--side' : ''">
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
                <AButton v-if="canManageFloorPlan" variant="secondary" size="sm" @click="openFloorEditor">
                  <template #leading><PhPencilSimple /></template>{{ t('operations.floorMap.edit') }}
                </AButton>
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
                  :events="recentActivity.events.value"
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
    </template>

    <EmptyState v-else :icon="PhTable" :message="t('operations.noData')" />

    <!-- Table details open in the shared centred modal at every width. -->
    <TableDetailsDrawer
      :table="selectedTable"
      :staff="snapshot?.staff ?? []"
      :free-tables="freeTables"
      :currency="snapshot?.restaurant.currency ?? 'EUR'"
      dashboard-mode
      :session-timing="selectedSessionTiming"
      @close="clearSelection"
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

/* SALOA §10.2 generic entrance: first paint only, opacity + 4px rise; nothing moves when motion is reduced. */
@media (prefers-reduced-motion: no-preference) {
  .dashboard-enter { animation: dashboard-enter var(--duration-base) var(--ease-out) both; }
}
@keyframes dashboard-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
</style>
