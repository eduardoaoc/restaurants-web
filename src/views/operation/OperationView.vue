<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCookingPot, PhTable, PhUsersThree } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import RestaurantOnboarding from '@/components/dashboard/RestaurantOnboarding.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import AttentionPanel from '@/components/dashboard/operation/AttentionPanel.vue'
import CapacityPanel from '@/components/dashboard/operation/CapacityPanel.vue'
import FloorMapEditor from '@/components/dashboard/operation/FloorMapEditor.vue'
import KitchenLivePanel from '@/components/dashboard/operation/KitchenLivePanel.vue'
import QuickActions from '@/components/dashboard/operation/QuickActions.vue'
import QuickMetrics from '@/components/dashboard/operation/QuickMetrics.vue'
import RestaurantFloorMap from '@/components/dashboard/operation/RestaurantFloorMap.vue'
import StaffLivePanel from '@/components/dashboard/operation/StaffLivePanel.vue'
import TableDetailsDrawer from '@/components/dashboard/table/TableDetailsDrawer.vue'
import { usePermissions } from '@/composables/usePermissions'
import type { OperationsLiveSnapshot, OperationsTable } from '@/types/operations'
import type { ReceivedRealtimeEvent } from '@/composables/useRestaurantRealtime'

const props = defineProps<{
  restaurantId: number | null
  snapshot: OperationsLiveSnapshot | null
  loading: boolean
  refreshing: boolean
  error: import('@/api/errors').ApiError | null
  /** Passo 1.3: raw, non-debounced — only the Floor Map Editor cares about one specific event name here (§20). */
  lastRealtimeEvent: ReceivedRealtimeEvent | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const { t } = useI18n()
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
      <QuickMetrics
        :summary="snapshot.summary"
        :currency="snapshot.restaurant.currency"
        :pending-attention-count="snapshot.alerts.length"
      />

      <!-- Problems before the map (§5/§11): "Necesita atención" is first in
           document order — mobile AND tablet (both below `lg`) stack it
           above the Floor Map, and it's also what a screen reader reaches
           first. `lg:order-*` only re-flows the VISUAL position once there's
           room for the map to stay wide and prominent side-by-side. -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.75fr_1fr]">
        <SectionCard :icon="PhBellRinging" :title="t('operations.alerts.title')" class="lg:order-2">
          <AttentionPanel :alerts="snapshot.alerts" @open-table="openTableById" />
        </SectionCard>

        <SectionCard :icon="PhTable" :title="t('operations.floorMap.title')" class="lg:order-1">
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
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard :icon="PhCookingPot" :title="t('operations.kitchen.title')">
          <KitchenLivePanel :kitchen="snapshot.kitchen" />
        </SectionCard>
        <SectionCard :icon="PhUsersThree" :title="t('operations.staff.title')">
          <StaffLivePanel :staff="snapshot.staff" />
        </SectionCard>
        <SectionCard :icon="PhTable" :title="t('operations.capacity.title')">
          <CapacityPanel :tables="allTables" :active-guests="snapshot.summary.active_guests" />
        </SectionCard>
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

    <FloorMapEditor
      v-if="showEditor && canManageFloorPlan"
      :restaurant-id="restaurantId"
      :last-realtime-event="lastRealtimeEvent"
      @close="onEditorClose"
    />
  </div>
</template>
