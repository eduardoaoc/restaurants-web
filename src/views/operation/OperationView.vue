<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCookingPot, PhGauge, PhTable, PhUsersThree, PhWallet } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import MetricCard from '@/components/dashboard/MetricCard.vue'
import RestaurantOnboarding from '@/components/dashboard/RestaurantOnboarding.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import AttentionPanel from '@/components/dashboard/operation/AttentionPanel.vue'
import BottleneckPanel from '@/components/dashboard/operation/BottleneckPanel.vue'
import CapacityPanel from '@/components/dashboard/operation/CapacityPanel.vue'
import FloorMapEditor from '@/components/dashboard/operation/FloorMapEditor.vue'
import KitchenLivePanel from '@/components/dashboard/operation/KitchenLivePanel.vue'
import QuickActions from '@/components/dashboard/operation/QuickActions.vue'
import QuickMetrics from '@/components/dashboard/operation/QuickMetrics.vue'
import RestaurantFloorMap from '@/components/dashboard/operation/RestaurantFloorMap.vue'
import StaffLivePanel from '@/components/dashboard/operation/StaffLivePanel.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import { usePermissions } from '@/composables/usePermissions'
import { formatMoney } from '@/utils/format'
import type { OperationsLiveSnapshot, OperationsTable } from '@/types/operations'

const props = defineProps<{
  restaurantId: number | null
  snapshot: OperationsLiveSnapshot | null
  loading: boolean
  refreshing: boolean
  error: import('@/api/errors').ApiError | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const { t, locale } = useI18n()
const { can } = usePermissions()

const canManageFloorPlan = computed(() => can('manage_floor_plan'))

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
const criticalAlertsCount = computed(() => props.snapshot?.alerts.filter((a) => a.severity === 'critical').length ?? 0)
// Nothing configured anywhere yet (not "this zone is empty" — the whole
// restaurant) — every operational panel would just be a wall of empty
// states in that case, so the onboarding card replaces them instead.
const hasAnyTables = computed(() => allTables.value.length > 0)

function openTableById(tableId: number): void {
  selectedTableId.value = tableId
}

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
    <div v-if="loading" class="flex items-center justify-center py-24">
      <AProgress />
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
      <QuickActions
        :refreshing="refreshing"
        :can-manage-floor-plan="canManageFloorPlan"
        @edit-floor-plan="openFloorEditor"
        @refresh="emit('refresh')"
      />

      <RestaurantOnboarding
        v-if="!hasAnyTables"
        :total-tables="allTables.length"
        :can-manage-floor-plan="canManageFloorPlan"
        @open-floor-editor="openFloorEditor"
      />

      <template v-else>
      <QuickMetrics :summary="snapshot.summary" :critical-alerts-count="criticalAlertsCount" />

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.75fr_1fr]">
        <SectionCard :icon="PhTable" :title="t('operations.floorMap.title')">
          <template #default>
            <div class="mb-3 flex items-center justify-between gap-3">
              <span class="text-label-md text-on-surface-variant">
                {{ t('operations.floorMap.summary', { tables: snapshot.summary.tables.total, guests: snapshot.summary.active_guests }) }}
              </span>
              <button
                v-if="canManageFloorPlan"
                type="button"
                class="rounded-md border border-primary/30 bg-primary-container/40 px-3 py-1.5 text-label-md font-medium text-on-primary-container hover:bg-primary-container/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="openFloorEditor"
              >
                {{ t('operations.floorMap.edit') }}
              </button>
            </div>
            <RestaurantFloorMap
              :floors="snapshot.floors"
              :unassigned-tables="snapshot.unassigned_tables"
              :selected-table-id="selectedTableId"
              @select-table="(table) => (selectedTableId = table.id)"
            />
          </template>
        </SectionCard>

        <SectionCard :icon="PhBellRinging" :title="t('operations.alerts.title')">
          <AttentionPanel :alerts="snapshot.alerts" @open-table="openTableById" />
        </SectionCard>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard :icon="PhCookingPot" :title="t('operations.kitchen.title')">
          <KitchenLivePanel :kitchen="snapshot.kitchen" />
        </SectionCard>
        <SectionCard :icon="PhUsersThree" :title="t('operations.staff.title')">
          <StaffLivePanel :staff="snapshot.staff" />
        </SectionCard>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard :icon="PhGauge" :title="t('operations.bottleneck.title')">
          <BottleneckPanel :bottleneck="snapshot.operation.bottleneck" />
        </SectionCard>
        <SectionCard :icon="PhTable" :title="t('operations.capacity.title')">
          <CapacityPanel
            :tables="allTables"
            :active-guests="snapshot.summary.active_guests"
            :occupied-tables="snapshot.summary.tables.occupied"
            :total-tables="snapshot.summary.tables.total"
          />
        </SectionCard>
        <MetricCard
          :icon="PhWallet"
          :label="t('operations.salesToday')"
          :value="formatMoney(snapshot.summary.sales.received_today, locale, snapshot.restaurant.currency)"
        />
      </div>
      </template>
    </template>

    <EmptyState v-else :icon="PhTable" :message="t('operations.noData')" />

    <TableDetailsDrawer
      :table="selectedTable"
      :staff="snapshot?.staff ?? []"
      :free-tables="freeTables"
      :currency="snapshot?.restaurant.currency ?? 'EUR'"
      @close="selectedTableId = null"
      @refresh="onDrawerRefresh"
    />

    <FloorMapEditor v-if="showEditor && canManageFloorPlan" :restaurant-id="restaurantId" @close="onEditorClose" />
  </div>
</template>
