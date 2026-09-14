<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCheckCircle, PhTable } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import OrderDetailSheet from '@/components/service/OrderDetailSheet.vue'
import { useOrderApprovals } from '@/composables/useOrderApprovals'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { getTableStatusStyle } from '@/composables/useTableStatusStyle'
import { useRestaurantStore } from '@/stores/restaurant'
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
const hasAnyAccess = computed(
  () => canApprove.value || canViewOperations.value || canCreateOrders.value || can('serve_orders'),
)

const approvals = useOrderApprovals(() => canApprove.value)
const operations = useRestaurantOperations(() => canViewOperations.value)

// Same realtime → coalesced refetch pattern as DashboardView (Passo 1.3) —
// order.created/order.status_changed already trigger this, so a customer's
// QR order reaches this screen without a manual refresh.
const realtime = useRestaurantRealtime(
  () => restaurantStore.currentRestaurantId,
  () => canViewOperations.value || canApprove.value,
)
watch(
  () => realtime.refreshTick.value,
  () => {
    operations.refetch()
    approvals.refetch()
  },
)

const currency = computed(
  () => operations.snapshot.value?.restaurant.currency ?? restaurantStore.currentSettings?.currency ?? DEFAULT_CURRENCY,
)

function orderAgeSeconds(order: Order): number {
  return Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000))
}

const allTables = computed<OperationsTable[]>(() => {
  if (!operations.snapshot.value) return []
  const fromFloors = operations.snapshot.value.floors.flatMap((floor) => floor.zones.flatMap((zone) => zone.tables))
  return [...fromFloors, ...operations.snapshot.value.unassigned_tables]
})
// Occupied/needs-attention tables first — what a waiter scans for; free
// tables (nothing to do yet) sink to the bottom, never hidden entirely.
const sortedTables = computed(() =>
  [...allTables.value].sort((a, b) => {
    if (a.primary_status === 'free' && b.primary_status !== 'free') return 1
    if (a.primary_status !== 'free' && b.primary_status === 'free') return -1
    return a.name.localeCompare(b.name)
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

      <SectionCard v-if="canViewOperations" :icon="PhTable" :title="t('service.tables.title')">
        <div v-if="operations.loading.value" class="flex justify-center py-6">
          <AProgress size="sm" />
        </div>
        <p v-else-if="operations.error.value" class="text-body-md text-error" role="alert">
          {{ operations.error.value.kind === 'forbidden' ? t('operations.errors.forbidden') : describeApiError(operations.error.value, t) }}
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
