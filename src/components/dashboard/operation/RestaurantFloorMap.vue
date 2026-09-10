<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArmchair } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { getTableStatusStyle } from '@/composables/useTableStatusStyle'
import type { OperationsFloor, OperationsTable, TablePrimaryStatus } from '@/types/operations'
import FloorTableMarker from './FloorTableMarker.vue'

const props = defineProps<{
  floors: OperationsFloor[]
  unassignedTables: OperationsTable[]
  selectedTableId: number | null
}>()

const emit = defineEmits<{ 'select-table': [OperationsTable] }>()

const { t } = useI18n()

const selectedFloorId = ref<number | null>(props.floors[0]?.id ?? null)

watch(
  () => props.floors,
  (floors) => {
    if (!floors.some((floor) => floor.id === selectedFloorId.value)) {
      selectedFloorId.value = floors[0]?.id ?? null
    }
  },
)

const currentFloor = computed(() => props.floors.find((floor) => floor.id === selectedFloorId.value) ?? null)

const LEGEND_STATUSES: TablePrimaryStatus[] = [
  'free',
  'occupied',
  'preparing',
  'ready',
  'waiter_requested',
  'bill_requested',
]

function tableLabel(table: OperationsTable): string {
  return t('operations.floorMap.tableLabel', {
    name: table.name,
    status: t(getTableStatusStyle(table.primary_status).labelKey),
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Floor selector — only shown when there is more than one floor to choose from -->
    <div v-if="floors.length > 1" class="flex flex-wrap gap-2" role="tablist" :aria-label="t('operations.floorMap.floorSelector')">
      <button
        v-for="floor in floors"
        :key="floor.id"
        type="button"
        role="tab"
        :aria-selected="selectedFloorId === floor.id"
        class="rounded-full px-4 py-2 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="
          selectedFloorId === floor.id
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
        "
        @click="selectedFloorId = floor.id"
      >
        {{ floor.name }}
      </button>
    </div>

    <!-- No floors/zones/tables configured at all yet -->
    <EmptyState
      v-if="floors.length === 0 && unassignedTables.length === 0"
      :icon="PhArmchair"
      :message="t('operations.floorMap.empty')"
    />

    <template v-else>
      <!-- Legend — status conveyed by icon + label everywhere, this is a scannability aid, not the only signal -->
      <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-label-md text-on-surface-variant">
        <span v-for="status in LEGEND_STATUSES" :key="status" class="inline-flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full" :class="getTableStatusStyle(status).tone" />
          {{ t(getTableStatusStyle(status).labelKey) }}
        </span>
      </div>

      <div v-if="currentFloor" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ASurface
          v-for="zone in currentFloor.zones"
          :key="zone.id"
          tone="container"
          radius="lg"
          bordered
          class="overflow-hidden"
        >
          <div class="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <span class="text-title-md font-medium text-on-surface">{{ zone.name }}</span>
            <span class="text-label-md text-on-surface-variant">
              {{ t('operations.floorMap.tableCount', zone.tables.length) }}
            </span>
          </div>

          <EmptyState
            v-if="zone.tables.length === 0"
            :icon="PhArmchair"
            :message="t('operations.floorMap.zoneEmpty')"
          />
          <div v-else class="relative min-h-80 floor-canvas">
            <FloorTableMarker
              v-for="table in zone.tables"
              :key="table.id"
              :table="table"
              :label="tableLabel(table)"
              :selected="selectedTableId === table.id"
              @select="emit('select-table', table)"
            />
          </div>
        </ASurface>
      </div>

      <!-- Tables with no zone assigned yet — real positions may be null, so listed rather than canvas-placed -->
      <ASurface v-if="unassignedTables.length > 0" tone="container" radius="lg" bordered class="p-4">
        <p class="mb-3 text-label-lg font-medium text-on-surface-variant">
          {{ t('operations.floorMap.unassigned') }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="table in unassignedTables"
            :key="table.id"
            type="button"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-label-lg font-medium transition-transform duration-200 ease-out hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="[getTableStatusStyle(table.primary_status).tone, selectedTableId === table.id ? 'ring-2 ring-primary' : '']"
            :aria-label="tableLabel(table)"
            @click="emit('select-table', table)"
          >
            <component :is="getTableStatusStyle(table.primary_status).icon" :size="16" aria-hidden="true" />
            {{ table.name }}
          </button>
        </div>
      </ASurface>
    </template>
  </div>
</template>

<style scoped>
/*
 * Depth/texture for the floor canvas — a restrained stand-in for the HTML
 * reference's 3D-perspective floor (see docs/design-system.md §21, 60% ref2
 * "dark premium/technological" weighting): a faint grid + a soft ambient
 * glow anchored top-left, never a literal 3D transform (that would break
 * keyboard table selection and add no real information). Kept in its own
 * token-free block since these are compositing effects, not semantic color.
 */
.floor-canvas {
  background-color: var(--color-surface-container-low);
  background-image:
    radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 45%),
    linear-gradient(color-mix(in srgb, var(--color-on-surface) 4%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-on-surface) 4%, transparent) 1px, transparent 1px);
  background-size:
    100% 100%,
    28px 28px,
    28px 28px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
</style>
