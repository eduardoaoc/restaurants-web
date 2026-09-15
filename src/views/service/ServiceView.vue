<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCheckCircle, PhStar, PhTable } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import AttentionPanel from '@/components/dashboard/operation/AttentionPanel.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import OrderDetailSheet from '@/components/service/OrderDetailSheet.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { useOrderApprovals } from '@/composables/useOrderApprovals'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { getTableStatusStyle } from '@/composables/useTableStatusStyle'
import { customerFeedbackService } from '@/services/customer-feedback.service'
import { tablesService } from '@/services/tables.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { CustomerFeedbackSummary } from '@/types/customer-feedback'
import type { FloorPlanTable } from '@/types/floor-plan'
import type { OperationsTable } from '@/types/operations'
import type { Order } from '@/types/orders'
import { describeApiError } from '@/utils/error-message'
import { DEFAULT_CURRENCY, formatDuration, formatMoney } from '@/utils/format'

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
const restaurantStore = useRestaurantStore()
const { can } = usePermissions()

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
  () => canApprove.value || canViewTables.value || canCreateOrders.value || can('serve_orders'),
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

const approvals = useOrderApprovals(() => canApprove.value)
const operations = useRestaurantOperations(() => canViewOperations.value)

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
  () => canViewTables.value || canApprove.value,
)
watch(
  () => realtime.refreshTick.value,
  () => {
    operations.refetch()
    approvals.refetch()
    void fetchFallbackTables()
  },
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

const selectedTableId = ref<number | null>(null)
const selectedTable = computed(() => allTables.value.find((table) => table.id === selectedTableId.value) ?? null)

function openTable(tableId: number): void {
  selectedTableId.value = tableId
}
function onDrawerRefresh(): void {
  operations.refetch()
  approvals.refetch()
  void fetchFallbackTables()
}

const selectedOrder = ref<Order | null>(null)

function openOrder(order: Order): void {
  selectedOrder.value = order
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
    selectedOrder.value = null
  },
)

async function approveSelected(): Promise<void> {
  if (!selectedOrder.value) return
  const err = await approvals.approve(selectedOrder.value.id)
  if (!err) {
    selectedOrder.value = null
    operations.refetch()
  }
}

async function rejectSelected(): Promise<void> {
  if (!selectedOrder.value) return
  const err = await approvals.reject(selectedOrder.value.id)
  if (!err) {
    selectedOrder.value = null
    operations.refetch()
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-headline font-bold text-on-surface">{{ t('service.title') }}</h2>
      <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('service.subtitle') }}</p>
    </div>

    <ASurface v-if="!hasAnyAccess" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('service.noAccess') }}</p>
    </ASurface>

    <template v-else>
      <SectionCard v-if="canApprove" :icon="PhBellRinging" :title="t('service.pending.title')">
        <div v-if="approvals.loading.value" class="flex justify-center py-6">
          <AProgress size="sm" />
        </div>
        <p v-else-if="approvals.error.value" class="text-body-md text-error" role="alert">
          {{ describeApiError(approvals.error.value, t) }}
        </p>
        <EmptyState v-else-if="approvals.orders.value.length === 0" :icon="PhCheckCircle" :message="t('service.pending.empty')" />
        <ul v-else class="flex flex-col divide-y divide-outline-variant">
          <li v-for="order in approvals.orders.value" :key="order.id">
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="openOrder(order)"
            >
              <div class="min-w-0">
                <p class="truncate text-body-lg font-medium text-on-surface">{{ order.table.name }} · {{ order.order_number }}</p>
                <p class="text-label-md text-on-surface-variant">
                  {{ t('service.pending.itemCount', { count: order.items.length }) }} · {{ formatDuration(orderAgeSeconds(order)) }}
                </p>
              </div>
              <span class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
                {{ formatMoney(order.total, locale, currency) }}
              </span>
            </button>
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        v-if="canViewTables && operations.snapshot.value && operations.snapshot.value.alerts.length > 0"
        :icon="PhBellRinging"
        :title="t('operations.alerts.title')"
      >
        <AttentionPanel :alerts="operations.snapshot.value.alerts" @open-table="openTable" />
      </SectionCard>

      <SectionCard v-if="canViewTables" :icon="PhTable" :title="t('service.tables.title')">
        <div v-if="tablesLoading" class="flex justify-center py-6">
          <AProgress size="sm" />
        </div>
        <p v-else-if="tablesError" class="text-body-md text-error" role="alert">
          {{ tablesError.kind === 'forbidden' ? t('operations.errors.forbidden') : describeApiError(tablesError, t) }}
        </p>
        <EmptyState v-else-if="sortedTables.length === 0" :icon="PhTable" :message="t('service.tables.empty')" />
        <ul v-else class="flex flex-col divide-y divide-outline-variant">
          <li v-for="table in sortedTables" :key="table.id">
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="openTable(table.id)"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  :class="getTableStatusStyle(table.primary_status).tone"
                >
                  <component :is="getTableStatusStyle(table.primary_status).icon" :size="18" aria-hidden="true" />
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-body-lg font-medium text-on-surface">{{ table.name }}</span>
                  <span class="text-label-md text-on-surface-variant">{{ t(getTableStatusStyle(table.primary_status).labelKey) }}</span>
                </span>
              </div>
              <span v-if="table.orders.waiting_approval > 0" class="shrink-0 rounded-full bg-warning-container px-2 py-0.5 text-label-md font-medium text-on-warning-container">
                {{ t('service.tables.waitingApprovalBadge', { count: table.orders.waiting_approval }) }}
              </span>
            </button>
          </li>
        </ul>
      </SectionCard>

      <!-- "Mis valoraciones" (Passo 3.5 §17) — the waiter's own aggregate
           only, GET /me/feedback-summary. Deliberately never the same card
           as "Rendimiento" (internal manager review, staff.detail.* / the
           unrelated StaffReview system) — separate section, separate label,
           never mixed (CLAUDE.md §15/§19 for this Passo). -->
      <SectionCard v-if="canSeeOwnFeedback" :icon="PhStar" :title="t('service.feedback.title')">
        <div v-if="feedbackSummaryLoading" class="flex justify-center py-4">
          <AProgress size="sm" />
        </div>
        <p v-else-if="feedbackSummaryError" class="text-body-md text-error" role="alert">
          {{ describeApiError(feedbackSummaryError, t) }}
        </p>
        <EmptyState
          v-else-if="feedbackSummary && feedbackSummary.feedback_count === 0"
          :icon="PhStar"
          :message="t('service.feedback.empty')"
        />
        <template v-else-if="feedbackSummary">
          <div class="flex items-baseline gap-2">
            <span class="text-display font-semibold text-on-surface">{{ feedbackSummary.average_overall?.toFixed(1) }}</span>
            <PhStar :size="22" weight="fill" class="text-primary" aria-hidden="true" />
            <span class="text-label-lg text-on-surface-variant">
              {{ t('service.feedback.count', feedbackSummary.feedback_count) }}
            </span>
          </div>
          <dl class="mt-3 grid grid-cols-3 gap-3">
            <div v-if="feedbackSummary.average_service !== null">
              <dt class="text-label-md text-on-surface-variant">{{ t('feedback.detail.service') }}</dt>
              <dd class="text-title-md font-semibold tabular-nums text-on-surface">{{ feedbackSummary.average_service.toFixed(1) }}</dd>
            </div>
            <div v-if="feedbackSummary.average_food !== null">
              <dt class="text-label-md text-on-surface-variant">{{ t('feedback.detail.food') }}</dt>
              <dd class="text-title-md font-semibold tabular-nums text-on-surface">{{ feedbackSummary.average_food.toFixed(1) }}</dd>
            </div>
            <div v-if="feedbackSummary.average_wait_time !== null">
              <dt class="text-label-md text-on-surface-variant">{{ t('feedback.detail.waitTime') }}</dt>
              <dd class="text-title-md font-semibold tabular-nums text-on-surface">{{ feedbackSummary.average_wait_time.toFixed(1) }}</dd>
            </div>
          </dl>
        </template>
      </SectionCard>
    </template>

    <TableDetailsDrawer
      :table="selectedTable"
      :staff="operations.snapshot.value?.staff ?? []"
      :free-tables="freeTables"
      :currency="currency"
      @close="selectedTableId = null"
      @refresh="onDrawerRefresh"
    />

    <OrderDetailSheet
      v-if="selectedOrder"
      :order="selectedOrder"
      :currency="currency"
      :approving="approvals.actingOn[selectedOrder.id] === 'approve'"
      :rejecting="approvals.actingOn[selectedOrder.id] === 'reject'"
      :action-error="approvals.actionError[selectedOrder.id] ?? null"
      @close="selectedOrder = null"
      @approve="approveSelected"
      @reject="rejectSelected"
    />
  </div>
</template>
