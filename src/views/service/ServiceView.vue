<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  PhArrowClockwise,
  PhBellRinging,
  PhBellSimple,
  PhCaretDown,
  PhHandPalm,
  PhInfo,
  PhReceipt,
  PhStar,
  PhUsers,
  PhWarning,
  PhWarningOctagon,
} from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import APageHeader from '@/components/ui/APageHeader.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import ASurface from '@/components/ui/ASurface.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import ProductAvailabilityPanel from '@/components/service/ProductAvailabilityPanel.vue'
import DailyOperationBanner from '@/components/shared/DailyOperationBanner.vue'
import { useProductAvailability } from '@/composables/useProductAvailability'
import OrderDetailSheet from '@/components/service/OrderDetailSheet.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { useOperationalTableDeepLink } from '@/composables/useOperationalTableDeepLink'
import { useOrderApprovals } from '@/composables/useOrderApprovals'
import { provideCatalogRefresh } from '@/composables/useCatalogRefresh'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { customerFeedbackService } from '@/services/customer-feedback.service'
import { tablesService } from '@/services/tables.service'
import { useRestaurantStore } from '@/stores/restaurant'
import { useAuthStore } from '@/stores/auth'
import type { CustomerFeedbackSummary } from '@/types/customer-feedback'
import type { FloorPlanTable } from '@/types/floor-plan'
import type { OperationsAlert, OperationsTable } from '@/types/operations'
import type { Order } from '@/types/orders'
import { describeApiError } from '@/utils/error-message'
import { operationsAlertTypeLabelKey } from '@/utils/operations-alerts'
import { DEFAULT_CURRENCY, formatDuration, formatMoney } from '@/utils/format'
import { useSnackbar } from '@/composables/useSnackbar'
import ServiceTableTile from '@/components/service/ServiceTableTile.vue'

/**
 * "Servicio" (Passo 3.2) — the waiter's own operational entry point,
 * distinct from the Owner's Dashboard (CLAUDE.md Passo 3.2 §5): answers
 * "what needs my attention right now" (orders waiting for approval) and
 * "which tables can I act on" (occupied first, tap through to the SAME
 * TableDetailsDrawer the Dashboard already uses — never a second table-
 * detail implementation). Every section gates independently on its own
 * real permission, mirroring SettingsView's mixed-scope precedent — there
 * is no single `meta.permission` for this whole screen (see router).
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const restaurantStore = useRestaurantStore()
const authStore = useAuthStore()
const snackbar = useSnackbar()
const refreshCatalog = provideCatalogRefresh()
const { can } = usePermissions()

const canChangeAvailability = computed(() => can('manage_product_availability') || can('manage_products'))
const availability = useProductAvailability(() => canChangeAvailability.value, () => realtime.refresh())
const canApprove = computed(() => can('approve_customer_orders'))
const canViewOperations = computed(() => can('view_operations'))
const canCreateOrders = computed(() => can('create_orders'))
// Passo 3.4 §9 navigation audit (real finding, not hypothetical): a cashier
// holds ONLY record_payments/close_bill/handle_table_requests — never
// view_operations. GET /operations/live 403s for that account (verified
// live), so `canViewTables` below must NOT widen `operations`'s own enabled
// gate (that would just trade "no data" for "a real 403 banner"). Instead
// this screen falls back to GET /restaurants/{id}/tables — confirmed
// reachable by that exact permission set — as a second, lighter table
// source (fallbackTables below), so "which table do I charge/close" still
// has a real, backend-authorized answer.
const canRecordPayments = computed(() => can('record_payments'))
const canCloseBill = computed(() => can('close_bill'))
const canHandleTableRequests = computed(() => can('handle_table_requests'))
const canViewTables = computed(
  () => canViewOperations.value || canRecordPayments.value || canCloseBill.value || canHandleTableRequests.value,
)
const usingFallbackTables = computed(() => !canViewOperations.value && canViewTables.value)
// Passo 3.5 §17/§22: a waiter's own customer-feedback aggregate — never the
// administrative list/detail (that's /app/feedback, view_customer_feedback
// only). serve_orders is the closest real permission to "this account can
// be an assigned waiter, so GET /me/feedback-summary is meaningful for
// them" — kitchen/cashier never hold it, so this card never renders for
// them (own-data endpoint, no permission required server-side, but showing
// an always-empty card to an account that can never be an assigned waiter
// is pointless UI, not a privacy boundary — that boundary is enforced by
// what the endpoint itself returns, see CustomerFeedbackSummary's docblock).
const canSeeOwnFeedback = computed(() => can('serve_orders'))
const hasAnyAccess = computed(
  () => canChangeAvailability.value || canApprove.value || canViewTables.value || canCreateOrders.value || can('serve_orders'),
)

const feedbackSummary = ref<CustomerFeedbackSummary | null>(null)
const feedbackSummaryLoading = ref(false)
const feedbackSummaryError = ref<ApiError | null>(null)

async function fetchFeedbackSummary(): Promise<void> {
  if (!canSeeOwnFeedback.value) {
    feedbackSummary.value = null
    return
  }
  feedbackSummaryLoading.value = true
  feedbackSummaryError.value = null
  try {
    feedbackSummary.value = await customerFeedbackService.meSummary()
  } catch (err) {
    feedbackSummaryError.value = normalizeApiError(err)
  } finally {
    feedbackSummaryLoading.value = false
  }
}
watch(() => [restaurantStore.currentRestaurantId, canSeeOwnFeedback.value] as const, fetchFeedbackSummary, { immediate: true })

const operations = useRestaurantOperations(() => canViewOperations.value)
const approvals = useOrderApprovals(() => canApprove.value, () => realtime.refresh())

const fallbackTables = ref<FloorPlanTable[]>([])
const fallbackLoading = ref(false)
const fallbackError = ref<ApiError | null>(null)
let fallbackController: AbortController | null = null

async function fetchFallbackTables(): Promise<void> {
  const restaurantId = restaurantStore.currentRestaurantId
  if (!usingFallbackTables.value || restaurantId === null) {
    fallbackTables.value = []
    return
  }
  fallbackController?.abort()
  const request = new AbortController()
  fallbackController = request
  fallbackLoading.value = true
  fallbackError.value = null
  try {
    const result = await tablesService.list(restaurantId, request.signal)
    if (request.signal.aborted) return
    fallbackTables.value = result
  } catch (err) {
    if (request.signal.aborted) return
    fallbackError.value = normalizeApiError(err)
  } finally {
    if (!request.signal.aborted) fallbackLoading.value = false
  }
}
watch(() => [restaurantStore.currentRestaurantId, usingFallbackTables.value] as const, fetchFallbackTables, { immediate: true })
onBeforeUnmount(() => fallbackController?.abort())

// Same realtime → coalesced refetch pattern as DashboardView (Passo 1.3) —
// order.created/order.status_changed already trigger this, so a customer's
// QR order reaches this screen without a manual refresh.
const realtime = useRestaurantRealtime(
  () => restaurantStore.currentRestaurantId,
  () => canViewTables.value || canApprove.value || canChangeAvailability.value,
  { refresh: async () => {
    const catalogErrors = await refreshCatalog()
    await Promise.all([operations.refetch(), approvals.refetch(), fetchFallbackTables(), availability.refetch()])
    return [operations.refreshError.value, approvals.error.value, fallbackError.value, availability.error.value, ...catalogErrors]
  } },
)

const currency = computed(
  () => operations.snapshot.value?.restaurant.currency ?? restaurantStore.currentSettings?.currency ?? DEFAULT_CURRENCY,
)

function orderAgeSeconds(order: Order): number {
  return Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000))
}

/**
 * The flat Tables list carries far less than Operations Live (no billing
 * summary, no order counts, no assigned waiter, no bill/waiter-requested
 * flag) — this only maps what it DOES have, real fields never invented
 * ones. `primary_status` is reduced to free/occupied (the only two this
 * source can actually distinguish); TableDetailsDrawer's own TableBillPanel
 * (fetched separately, by session id) is what actually answers "does this
 * table need attention", not this list.
 */
function toOperationsTable(table: FloorPlanTable): OperationsTable {
  return {
    id: table.id,
    name: table.name,
    number: table.number,
    capacity: table.capacity,
    zone_id: table.zone_id,
    layout: table.layout,
    primary_status: table.has_active_session ? 'occupied' : 'free',
    flags: [],
    session: table.active_session
      ? {
          id: table.active_session.id,
          started_at: table.active_session.opened_at,
          elapsed_seconds: Math.max(0, Math.floor((Date.now() - new Date(table.active_session.opened_at).getTime()) / 1000)),
          guest_count: table.active_session.guest_count,
          guest_count_version: table.active_session.guest_count_version,
          assigned_waiter: null,
        }
      : null,
    orders: { open_count: 0, waiting_approval: 0, preparing: 0, ready: 0 },
    billing: null,
  }
}

const allTables = computed<OperationsTable[]>(() => {
  if (operations.snapshot.value) {
    const fromFloors = operations.snapshot.value.floors.flatMap((floor) => floor.zones.flatMap((zone) => zone.tables))
    return [...fromFloors, ...operations.snapshot.value.unassigned_tables]
  }
  if (usingFallbackTables.value) return fallbackTables.value.map(toOperationsTable)
  return []
})
const tablesLoading = computed(() => (usingFallbackTables.value ? fallbackLoading.value : operations.loading.value))
const tablesError = computed(() => (usingFallbackTables.value ? fallbackError.value : operations.error.value))
// Needs-attention tables first (Passo 3.4 §5 — bill/waiter requested and
// ready orders are the ones a waiter/cashier scans for), plain occupied
// next, free tables (nothing to do yet) sink to the bottom without ever
// being hidden. Text label + icon already carry the same signal per-row
// (getTableStatusStyle) — this ordering is a convenience on top, not the
// only way the state is conveyed.
function attentionRank(status: OperationsTable['primary_status']): number {
  if (status === 'bill_requested' || status === 'waiter_requested') return 0
  if (status === 'ready') return 1
  if (status === 'waiting_approval' || status === 'preparing') return 2
  if (status === 'free') return 4
  return 3
}
const sortedTables = computed(() =>
  [...allTables.value].sort((a, b) => {
    const rank = attentionRank(a.primary_status) - attentionRank(b.primary_status)
    return rank !== 0 ? rank : a.name.localeCompare(b.name)
  }),
)
const freeTables = computed(() => allTables.value.filter((table) => table.primary_status === 'free'))

const tableScope = ref<'all' | 'mine'>('all')
const selectedZoneId = ref<number | null>(null)
const currentUserId = computed(() => authStore.authContext?.user.id ?? null)
const canFilterMine = computed(() => operations.snapshot.value !== null && currentUserId.value !== null)
const serviceZones = computed(() => operations.snapshot.value?.floors.flatMap(floor => floor.zones) ?? [])
const visibleTables = computed(() => sortedTables.value.filter(table => {
  if (selectedZoneId.value !== null && table.zone_id !== selectedZoneId.value) return false
  if (tableScope.value === 'mine' && canFilterMine.value) return table.session?.assigned_waiter?.id === currentUserId.value
  return true
}))
const operationAlerts = computed(() => operations.snapshot.value?.alerts ?? [])
const primaryAlerts = computed(() => operationAlerts.value.filter(alert =>
  alert.table_id !== null && !(canApprove.value && alert.type === 'order_waiting_approval'),
))
const nonTableAlerts = computed(() => operationAlerts.value.filter(alert => alert.table_id === null))
const showNow = computed(() => canApprove.value || canViewTables.value)
const nowError = computed(() => {
  if (approvals.orders.value.length + primaryAlerts.value.length + nonTableAlerts.value.length > 0) return null
  if (tablesError.value && allTables.value.length === 0) return tablesError.value
  if (canApprove.value && approvals.error.value && approvals.orders.value.length === 0) return approvals.error.value
  if (canViewOperations.value && operations.error.value && operations.snapshot.value === null) return operations.error.value
  return null
})
const nowLoading = computed(() =>
  (canApprove.value && approvals.loading.value && approvals.orders.value.length === 0)
  || (canViewOperations.value && operations.loading.value && operations.snapshot.value === null),
)

function alertSection(alert: OperationsAlert): 'overview' | 'orders' | 'requests' | 'bill' {
  if (alert.type === 'order_waiting_approval' || alert.type === 'order_ready') return 'orders'
  if (alert.type === 'customer_waiter_request_pending' || alert.type === 'responsible_waiter_call_pending') return 'requests'
  if (alert.type === 'bill_request_pending') return 'bill'
  return 'overview'
}

const selectedTableId = ref<number | null>(null)
const selectedTable = computed(() => allTables.value.find((table) => table.id === selectedTableId.value) ?? null)
const selectedTableSection = ref<'overview' | 'orders' | 'requests' | 'bill'>('overview')

function openTable(tableId: number, section: 'overview' | 'orders' | 'requests' | 'bill' = 'overview'): void {
  selectedTableId.value = tableId
  selectedTableSection.value = section
}

function openAlertTable(alert: OperationsAlert): void {
  if (alert.table_id !== null) openTable(alert.table_id, alertSection(alert))
}

function statusForAlert(alert: OperationsAlert): 'attention' | 'warning' | 'critical' | 'normal' {
  if (alert.severity === 'critical') return 'critical'
  if (alert.severity === 'warning') return 'warning'
  return alert.type === 'order_waiting_approval' || alert.type === 'order_ready'
    || alert.type === 'customer_waiter_request_pending' || alert.type === 'bill_request_pending'
    || alert.type === 'responsible_waiter_call_pending' ? 'attention' : 'normal'
}

function iconForAlert(alert: OperationsAlert) {
  if (alert.type === 'order_waiting_approval') return PhHandPalm
  if (alert.type === 'order_ready') return PhBellSimple
  if (alert.type === 'bill_request_pending') return PhReceipt
  if (alert.type === 'customer_waiter_request_pending' || alert.type === 'responsible_waiter_call_pending') return PhBellRinging
  if (alert.type === 'active_table_unassigned' || alert.type === 'assigned_waiter_off_shift' || alert.type === 'assigned_waiter_suspended') return PhUsers
  if (alert.severity === 'critical') return PhWarningOctagon
  if (alert.severity === 'warning') return PhWarning
  return PhInfo
}

/**
 * Carta 8.1B revision — the `?restaurant=&table=` deep-link a waiter/
 * cashier's QR scan lands here with (useStaffTableEntry now routes
 * Servicio-eligible staff straight to app-service instead of losing the
 * query to the router guard's app-dashboard→app-service redirect). Shared
 * plumbing with DashboardView via useOperationalTableDeepLink; only the
 * gate differs — `canViewTables` here, covering both the operations-backed
 * source and the cashier's fallback table list, exactly what
 * `usingFallbackTables` above already decides between for `allTables`.
 *
 * Waits for `!tablesLoading` (never just a truthy snapshot — this screen's
 * table source can be either `operations.snapshot` or the fallback list,
 * and either can still be mid-fetch) before searching `allTables`, so a
 * same-restaurant table that simply hasn't arrived yet is never treated as
 * "not found". Always consumes once loading settles, found or not, so the
 * query never dangles.
 */
const { pendingTableId, pendingSessionId, onPendingTableConsumed } = useOperationalTableDeepLink(route, router, () => canViewTables.value)
watch(
  () => [pendingTableId.value, tablesLoading.value, allTables.value, pendingSessionId.value] as const,
  ([pendingId, loading, tables, sessionId]) => {
    if (pendingId === null || loading) return
    const match = tables.find((table) => sessionId !== null ? table.session?.id === sessionId : table.id === pendingId)
    if (match) selectedTableId.value = match.id
    onPendingTableConsumed()
  },
  { immediate: true },
)
function onDrawerRefresh(): void {
  realtime.refresh()
}

async function toggleAvailability(product: import('@/types/product').RestaurantProduct): Promise<void> {
  const previous = availability.products.value.find(item => item.id === product.id)?.available
  await availability.toggle(product)
  const updated = availability.products.value.find(item => item.id === product.id)
  if (previous !== undefined && updated && updated.available !== previous) {
    snackbar.showSnackbar({ message: t('service.feedback.availabilityUpdated'), kind: 'success' })
  }
}

const selectedOrderId = ref<number | null>(null)
const selectedOrder = computed(() => canApprove.value
  ? approvals.orders.value.find((order) => order.id === selectedOrderId.value) ?? null : null)

function openOrder(order: Order): void {
  selectedOrderId.value = order.id
}

// Table ids aren't restaurant-scoped in the URL/state here, so switching
// A→B→A without this reset can silently reopen the drawer/sheet on
// whatever table/order id happens to still exist in the new restaurant
// (CLAUDE.md Passo 3.2 restaurant-switch isolation — found live during
// browser validation, not a hypothetical).
watch(
  () => restaurantStore.currentRestaurantId,
  () => {
    selectedTableId.value = null
    selectedTableSection.value = 'overview'
    selectedOrderId.value = null
    tableScope.value = 'all'
    selectedZoneId.value = null
  },
)

async function approveSelected(): Promise<void> {
  if (selectedOrder.value) await approveOrder(selectedOrder.value)
}

async function approveOrder(order: Order): Promise<void> {
  if (!approvals.canAct(order) || approvals.actingOn[order.id]) return
  const restaurantId = restaurantStore.currentRestaurantId
  const err = await approvals.approve(order.id)
  if (restaurantId !== restaurantStore.currentRestaurantId) return
  if (!err) {
    snackbar.showSnackbar({ message: t('service.feedback.orderApproved', { order: order.order_number }), kind: 'success' })
    if (selectedOrderId.value === order.id) selectedOrderId.value = null
  }
}

async function rejectSelected(): Promise<void> {
  const order = selectedOrder.value
  if (!order || !approvals.canAct(order) || approvals.actingOn[order.id]) return
  const restaurantId = restaurantStore.currentRestaurantId
  const err = await approvals.reject(order.id)
  if (restaurantId !== restaurantStore.currentRestaurantId) return
  if (!err) {
    snackbar.showSnackbar({ message: t('service.feedback.orderRejected', { order: order.order_number }), kind: 'info' })
    if (selectedOrderId.value === order.id) selectedOrderId.value = null
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">
    <APageHeader :title="t('service.title')">
      <template #context>
        <span class="inline-flex min-h-11 items-center text-body-sm text-fg-muted" role="status">
          {{ t(`operations.connection.${realtime.connectionState.value}`) }}
          <span v-if="realtime.connectionState.value !== 'connected'" class="ml-1">{{ t('kitchen.refreshHint') }}</span>
        </span>
      </template>
      <template #actions>
        <AButton variant="ghost" :loading="realtime.connectionState.value === 'connecting'" @click="onDrawerRefresh">
          <template #leading><PhArrowClockwise :size="20" aria-hidden="true" /></template>
          {{ t('operations.quickActions.refresh') }}
        </AButton>
      </template>
    </APageHeader>

    <ASurface v-if="!hasAnyAccess" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-fg">{{ t('service.noAccess') }}</p>
    </ASurface>

    <template v-else>
      <section v-if="showNow" aria-labelledby="service-now-heading" class="min-w-0">
        <div class="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="service-now-heading" class="text-title-lg font-semibold text-fg">{{ t('service.now.title') }}</h2>
          <span v-if="approvals.orders.value.length + primaryAlerts.length + nonTableAlerts.length" class="text-body-sm font-medium tabular-nums text-fg-muted" aria-live="polite">
            {{ t('service.now.count', approvals.orders.value.length + primaryAlerts.length + nonTableAlerts.length) }}
          </span>
        </div>

        <div v-if="nowLoading" class="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-busy="true" :aria-label="t('service.now.loading')">
          <div v-for="index in 2" :key="index" class="h-16 animate-pulse rounded-md bg-surface-subtle" />
        </div>
        <div v-else-if="nowError" class="rounded-md bg-danger-subtle px-4 py-3 text-body-md text-danger" role="alert">
          {{ describeApiError(nowError, t) }}
        </div>
        <p v-else-if="approvals.orders.value.length === 0 && primaryAlerts.length === 0 && nonTableAlerts.length === 0" class="py-2 text-body-md text-fg-muted">
          {{ t('service.now.empty') }}
        </p>
        <ul v-else class="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" :aria-label="t('service.now.title')">
          <li v-for="order in approvals.orders.value" :key="`order-${order.id}`" class="min-w-0 rounded-md border border-hairline bg-surface p-3 shadow-raised">
            <div class="flex min-w-0 items-start gap-2">
              <PhHandPalm :size="24" weight="fill" class="shrink-0 text-accent" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="break-words text-body-lg font-semibold text-fg">{{ order.table.name }}</p>
                <p class="break-words text-body-sm text-fg-muted">
                  {{ order.order_number }} · {{ formatDuration(orderAgeSeconds(order)) }}
                </p>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <AButton v-if="approvals.canAct(order)" size="md" :loading="approvals.actingOn[order.id] === 'approve'" :disabled="!!approvals.actingOn[order.id]" @click="approveOrder(order)">
                {{ t('service.order.approve') }}
              </AButton>
              <AButton variant="ghost" size="md" :aria-label="t('tableDrawer.orders.actions.viewDetail', { number: order.order_number })" @click="openOrder(order)">
                {{ t('service.pending.viewOrder') }}
              </AButton>
              <span class="ml-auto min-w-0 break-words text-body-sm font-semibold tabular-nums text-fg">
                {{ formatMoney(order.total, locale, currency) }}
              </span>
            </div>
            <p v-if="approvals.actionError[order.id]" class="mt-2 text-body-sm text-danger" role="alert">
              {{ describeApiError(approvals.actionError[order.id]!, t) }}
            </p>
          </li>
          <li v-for="alert in primaryAlerts" :key="`alert-${alert.id}`" class="min-w-0">
            <button
              v-if="alert.table_id !== null"
              type="button"
              class="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-md border border-hairline bg-surface px-3 py-3 text-left shadow-raised hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              @click="openAlertTable(alert)"
            >
              <AStatusBadge :state="statusForAlert(alert)" :label="alert.type && operationsAlertTypeLabelKey(alert.type) ? t(operationsAlertTypeLabelKey(alert.type)!) : alert.type" :icon="iconForAlert(alert)" />
              <span class="min-w-0 flex-1">
                <span class="block break-words text-body-lg font-semibold text-fg">{{ allTables.find(table => table.id === alert.table_id)?.name ?? t('service.tables.title') }}</span>
                <span class="block break-words text-body-sm text-fg-muted">{{ t(operationsAlertTypeLabelKey(alert.type) ?? 'operations.alerts.title') }} · {{ formatDuration(alert.age_seconds) }}</span>
              </span>
            </button>
          </li>
          <li v-for="alert in nonTableAlerts" :key="`alert-${alert.id}`" class="min-w-0">
            <div class="flex min-h-16 min-w-0 items-center gap-3 rounded-md border border-hairline bg-surface px-3 py-3 shadow-raised" role="status">
              <AStatusBadge :state="statusForAlert(alert)" :label="t(operationsAlertTypeLabelKey(alert.type) ?? 'operations.alerts.title')" :icon="iconForAlert(alert)" />
              <span class="min-w-0 flex-1">
                <span v-if="operations.snapshot.value?.staff.find(member => member.user.id === alert.user_id)?.user.name" class="block break-words text-body-lg font-semibold text-fg">
                  {{ operations.snapshot.value.staff.find(member => member.user.id === alert.user_id)?.user.name }}
                </span>
                <span class="block text-body-sm tabular-nums text-fg-muted">{{ formatDuration(alert.age_seconds) }}</span>
              </span>
            </div>
          </li>
        </ul>
        <p v-if="approvals.error.value && (approvals.orders.value.length > 0 || primaryAlerts.length + nonTableAlerts.length > 0)" class="mt-2 text-body-sm text-danger" role="alert">
          {{ describeApiError(approvals.error.value, t) }}
        </p>
      </section>

      <DailyOperationBanner
        v-if="operations.snapshot.value?.daily_operation"
        :daily-operation="operations.snapshot.value.daily_operation"
        :can-manage="can('open_daily_operation') || can('close_daily_operation')"
      />

      <section v-if="canViewTables" aria-labelledby="service-tables-heading" class="min-w-0">
        <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="service-tables-heading" class="text-title-lg font-semibold text-fg">{{ t('service.tables.title') }}</h2>
            <p v-if="tablesError && sortedTables.length > 0" class="mt-1 text-body-sm text-danger" role="status">
              {{ describeApiError(tablesError, t) }}
            </p>
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <div v-if="canFilterMine" class="inline-flex min-h-11 rounded-md bg-surface-subtle p-1" role="group" :aria-label="t('service.tables.scopeLabel')">
              <button type="button" class="min-h-11 rounded-sm px-3 text-body-sm font-medium" :class="tableScope === 'all' ? 'bg-surface text-fg shadow-raised' : 'text-fg-muted'" :aria-pressed="tableScope === 'all'" @click="tableScope = 'all'">{{ t('service.tables.all') }}</button>
              <button type="button" class="min-h-11 rounded-sm px-3 text-body-sm font-medium" :class="tableScope === 'mine' ? 'bg-surface text-fg shadow-raised' : 'text-fg-muted'" :aria-pressed="tableScope === 'mine'" @click="tableScope = 'mine'">{{ t('service.tables.mine') }}</button>
            </div>
            <label v-if="serviceZones.length > 1" class="flex min-h-11 min-w-0 items-center gap-2 text-body-sm text-fg-muted">
              <span class="sr-only">{{ t('service.tables.zoneLabel') }}</span>
              <select v-model="selectedZoneId" class="min-h-11 max-w-40 min-w-0 rounded-md border border-control bg-surface px-3 text-body-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <option :value="null">{{ t('service.tables.allZones') }}</option>
                <option v-for="zone in serviceZones" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
              </select>
            </label>
          </div>
        </div>

        <div v-if="tablesLoading && allTables.length === 0" class="grid grid-cols-2 gap-3 min-[414px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-busy="true" :aria-label="t('service.tables.loading')">
          <div v-for="index in 6" :key="index" class="min-h-28 animate-pulse rounded-md bg-surface-subtle" />
        </div>
        <div v-else-if="tablesError && allTables.length === 0" class="flex flex-col items-start gap-2 rounded-md bg-danger-subtle p-4 text-danger" role="alert">
          <p class="text-body-md">{{ tablesError.kind === 'forbidden' ? t('operations.errors.forbidden') : describeApiError(tablesError, t) }}</p>
          <AButton variant="secondary" @click="onDrawerRefresh">{{ t('operations.quickActions.refresh') }}</AButton>
        </div>
        <p v-else-if="allTables.length === 0" class="py-2 text-body-md text-fg-muted">{{ t('service.tables.empty') }}</p>
        <p v-else-if="visibleTables.length === 0" class="py-2 text-body-md text-fg-muted">{{ t('service.tables.filterEmpty') }}</p>
        <ul v-else class="grid grid-cols-2 gap-3 min-[414px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          <ServiceTableTile v-for="table in visibleTables" :key="table.id" :table="table" @select="openTable" />
        </ul>
      </section>

      <details v-if="canChangeAvailability" class="group min-w-0 rounded-lg border border-hairline bg-surface">
        <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-body-lg font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span>{{ t('availability.title') }}</span>
          <PhCaretDown :size="18" class="shrink-0 text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div class="border-t border-hairline p-3 sm:p-4">
          <ProductAvailabilityPanel :key="restaurantStore.currentRestaurantId ?? 0"
            :products="availability.products.value" :loading="availability.loading.value" :error="availability.error.value"
            :busy="availability.busy" :errors="availability.errors" @toggle="toggleAvailability" @refresh="realtime.refresh" />
        </div>
      </details>

      <details v-if="canSeeOwnFeedback" class="rounded-md border border-hairline bg-surface px-4 py-3">
        <summary class="flex min-h-11 cursor-pointer items-center text-body-lg font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {{ t('service.feedback.title') }}
        </summary>
        <div class="pt-2">
          <div v-if="feedbackSummaryLoading" class="h-12 animate-pulse rounded-sm bg-surface-subtle" aria-busy="true" :aria-label="t('service.feedback.loading')" />
          <p v-else-if="feedbackSummaryError" class="text-body-md text-danger" role="alert">{{ describeApiError(feedbackSummaryError, t) }}</p>
          <p v-else-if="feedbackSummary && feedbackSummary.feedback_count === 0" class="text-body-md text-fg-muted">{{ t('service.feedback.empty') }}</p>
          <template v-else-if="feedbackSummary">
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="text-display font-semibold tabular-nums text-fg">{{ feedbackSummary.average_overall?.toFixed(1) }}</span>
              <PhStar :size="20" weight="fill" class="text-warning" aria-hidden="true" />
              <span class="text-body-sm text-fg-muted">{{ t('service.feedback.count', feedbackSummary.feedback_count) }}</span>
            </div>
            <dl class="mt-3 grid grid-cols-3 gap-3">
              <div v-if="feedbackSummary.average_service !== null"><dt class="text-label-md text-fg-muted">{{ t('feedback.detail.service') }}</dt><dd class="text-title-md font-semibold tabular-nums text-fg">{{ feedbackSummary.average_service.toFixed(1) }}</dd></div>
              <div v-if="feedbackSummary.average_food !== null"><dt class="text-label-md text-fg-muted">{{ t('feedback.detail.food') }}</dt><dd class="text-title-md font-semibold tabular-nums text-fg">{{ feedbackSummary.average_food.toFixed(1) }}</dd></div>
              <div v-if="feedbackSummary.average_wait_time !== null"><dt class="text-label-md text-fg-muted">{{ t('feedback.detail.waitTime') }}</dt><dd class="text-title-md font-semibold tabular-nums text-fg">{{ feedbackSummary.average_wait_time.toFixed(1) }}</dd></div>
            </dl>
          </template>
        </div>
      </details>
    </template>

    <TableDetailsDrawer
      :table="selectedTable"
      :staff="operations.snapshot.value?.staff ?? []"
      :free-tables="freeTables"
      :currency="currency"
      service-mode
      :initial-section="selectedTableSection"
      @close="selectedTableId = null"
      @refresh="onDrawerRefresh"
    />

    <OrderDetailSheet
      v-if="selectedOrder"
      :key="selectedOrder.id"
      :order="selectedOrder"
      :currency="currency"
      :approving="approvals.actingOn[selectedOrder.id] === 'approve'"
      :rejecting="approvals.actingOn[selectedOrder.id] === 'reject'"
      :action-error="approvals.actionError[selectedOrder.id] ?? null"
      @close="selectedOrderId = null"
      @approve="approveSelected"
      @reject="rejectSelected"
    />
  </div>
</template>
