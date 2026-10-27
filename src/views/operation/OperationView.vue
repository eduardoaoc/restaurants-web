<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretRight, PhPencilSimple, PhTable } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AStatStrip from '@/components/dashboard/AStatStrip.vue'
import RestaurantOnboarding from '@/components/dashboard/RestaurantOnboarding.vue'
import DashboardNow from '@/components/dashboard/operation/DashboardNow.vue'
import DashboardTableOverview from '@/components/dashboard/operation/DashboardTableOverview.vue'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import CapacityPanel from '@/components/dashboard/operation/CapacityPanel.vue'
import DailyOperationBanner from '@/components/shared/DailyOperationBanner.vue'
import FloorMapEditor from '@/components/dashboard/operation/FloorMapEditor.vue'
import KitchenLivePanel from '@/components/dashboard/operation/KitchenLivePanel.vue'
import RestaurantFloorMap from '@/components/dashboard/operation/RestaurantFloorMap.vue'
import StaffLivePanel from '@/components/dashboard/operation/StaffLivePanel.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import { usePermissions } from '@/composables/usePermissions'
import { SERVICE_ACCESS_PERMISSIONS } from '@/types/auth-context'
import type { OperationsLiveSnapshot, OperationsTable } from '@/types/operations'
import type { ReceivedRealtimeEvent } from '@/composables/useRestaurantRealtime'
import { formatMoney, formatNumber } from '@/utils/format'

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
  canViewReports: boolean
}>()

const emit = defineEmits<{ refresh: []; 'pending-table-consumed': [] }>()

const { t, locale } = useI18n()
const { can, canAny } = usePermissions()

const canManageFloorPlan = computed(() => can('manage_floor_plan'))
const canViewService = computed(() => canAny(SERVICE_ACCESS_PERMISSIONS))
const canViewKitchen = computed(() => canAny(['update_kitchen_status', 'serve_orders']))
const canViewStaff = computed(() => can('manage_users'))
const canManageDailyOperation = computed(() => can('open_daily_operation') || can('close_daily_operation'))
const selectedTableId = ref<number | null>(null)
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
const statItems = computed(() => {
  if (!props.snapshot) return []
  const { summary, restaurant } = props.snapshot
  const items: Array<{ id: string; label: string; value: string; context?: string }> = [
    {
      id: 'occupied-tables',
      label: t('operations.quick.occupancy'),
      value: `${formatNumber(summary.tables.occupied, locale.value)} / ${formatNumber(summary.tables.total, locale.value)}`,
      context: t('operations.quick.occupancyContext', { percent: Math.round(summary.tables.occupancy_rate * 100) }),
    },
    { id: 'active-orders', label: t('operations.quick.activeOrders'), value: formatNumber(summary.orders.active, locale.value) },
    { id: 'active-guests', label: t('operations.quick.activeGuests'), value: formatNumber(summary.active_guests, locale.value) },
  ]
  if (props.canViewReports) {
    items.push({
      id: 'received-today',
      label: t('operations.quick.receivedToday'),
      value: formatMoney(summary.sales.received_today, locale.value, restaurant.currency),
    })
  }
  return items
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
    <div v-if="loading" class="flex flex-col gap-6" aria-busy="true" role="status">
      <span class="sr-only">{{ t('operations.loading') }}</span>
      <div class="h-16 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div v-for="index in 4" :key="index" class="h-24 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
      <div class="grid min-h-64 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div v-for="index in 8" :key="index" class="rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
    </div>

    <ASurface
      v-else-if="error"
      tone="container"
      radius="lg"
      role="alert"
      class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
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
    </ASurface>

    <template v-else-if="snapshot">
      <div class="dashboard-enter flex flex-col gap-8">
        <div class="flex flex-col gap-4">
          <DashboardNow
            :health="snapshot.operation"
            :alerts="snapshot.alerts"
            :can-view-service="canViewService"
          />

          <DailyOperationBanner
            v-if="snapshot.daily_operation.status === 'not_open'"
            :daily-operation="snapshot.daily_operation"
            :can-manage="canManageDailyOperation"
          />

          <section :aria-label="t('operations.quick.title')">
            <AStatStrip :items="statItems" />
          </section>
        </div>

        <RestaurantOnboarding
          v-if="!hasAnyTables"
          :total-tables="allTables.length"
          :can-manage-floor-plan="canManageFloorPlan"
          @open-floor-editor="openFloorEditor"
        />

        <template v-else>
          <!-- The room is the primary object: full content width, so zones keep their real proportions -->
          <section class="min-w-0" aria-labelledby="dashboard-tables-title">
            <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div class="min-w-0">
                <h2 id="dashboard-tables-title" class="text-section-title font-semibold text-fg">{{ t('operations.floorMap.title') }}</h2>
                <p class="mt-1 text-body-sm tabular-nums text-fg-muted">
                  {{ t('operations.floorMap.summary', { tables: snapshot.summary.tables.total, guests: snapshot.summary.active_guests }) }}
                </p>
              </div>
              <AButton v-if="canManageFloorPlan" variant="secondary" size="sm" @click="openFloorEditor">
                <template #leading><PhPencilSimple /></template>{{ t('operations.floorMap.edit') }}
              </AButton>
            </div>

            <div class="lg:hidden">
              <DashboardTableOverview :tables="allTables" :selected-table-id="selectedTableId" @select="selectedTableId = $event.id" />
            </div>
            <div class="hidden lg:block">
              <RestaurantFloorMap
                :floors="snapshot.floors"
                :unassigned-tables="snapshot.unassigned_tables"
                :selected-table-id="selectedTableId"
                @select-table="(table) => (selectedTableId = table.id)"
              />
            </div>

            <details class="group mt-4 border-t border-hairline">
              <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                <PhCaretRight :size="16" class="text-fg-muted transition-transform duration-base ease-out group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                {{ t('operations.capacity.title') }}
              </summary>
              <div class="pb-2 pl-6">
                <CapacityPanel :tables="allTables" :active-guests="snapshot.summary.active_guests" />
              </div>
            </details>
          </section>

          <!-- Context summaries share one row in equal columns; they never compete with the room for width -->
          <div v-if="canViewKitchen || canViewStaff" class="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
            <section v-if="canViewKitchen" class="min-w-0" aria-labelledby="dashboard-kitchen-title">
              <div class="mb-3 flex min-h-11 items-center justify-between gap-3">
                <h2 id="dashboard-kitchen-title" class="text-component-title font-semibold text-fg">{{ t('operations.kitchen.title') }}</h2>
                <AButton as="RouterLink" :to="{ name: 'app-kitchen' }" variant="ghost" size="sm">
                  {{ t('operations.now.viewKitchen') }}
                  <template #trailing><PhCaretRight /></template>
                </AButton>
              </div>
              <KitchenLivePanel :kitchen="snapshot.kitchen" />
            </section>

            <section v-if="canViewStaff" class="min-w-0" aria-labelledby="dashboard-staff-title">
              <div class="mb-3 flex min-h-11 items-center justify-between gap-3">
                <h2 id="dashboard-staff-title" class="text-component-title font-semibold text-fg">{{ t('operations.staff.title') }}</h2>
                <AButton as="RouterLink" :to="{ name: 'app-staff' }" variant="ghost" size="sm">
                  {{ t('operations.now.viewStaff') }}
                  <template #trailing><PhCaretRight /></template>
                </AButton>
              </div>
              <StaffLivePanel :staff="snapshot.staff" />
            </section>
          </div>
        </template>

        <DailyOperationBanner
          v-if="snapshot.daily_operation.status !== 'not_open'"
          :daily-operation="snapshot.daily_operation"
          :can-manage="canManageDailyOperation"
        />
      </div>
    </template>

    <EmptyState v-else :icon="PhTable" :message="t('operations.noData')" />

    <TableDetailsDrawer
      :table="selectedTable"
      :staff="snapshot?.staff ?? []"
      :free-tables="freeTables"
      :currency="snapshot?.restaurant.currency ?? 'EUR'"
      dashboard-mode
      @close="selectedTableId = null"
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
/* SALOA §10.2 generic entrance: first paint only, opacity + 4px rise; nothing moves when motion is reduced. */
@media (prefers-reduced-motion: no-preference) {
  .dashboard-enter { animation: dashboard-enter var(--duration-base) var(--ease-out) both; }
}
@keyframes dashboard-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
</style>
