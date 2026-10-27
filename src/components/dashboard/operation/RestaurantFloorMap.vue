<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArmchair } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import type { OperationsFloor, OperationsTable, TablePrimaryStatus } from '@/types/operations'
import { serviceTableStatus } from '@/utils/service-table-status'
import FloorTableMarker from './FloorTableMarker.vue'
import { floorTableIconTone, floorTableTone } from './floor-table-tone'

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
  'waiting_approval',
  'preparing',
  'ready',
  'waiter_requested',
  'bill_requested',
]

function tableLabel(table: OperationsTable): string {
  return t('operations.floorMap.tableLabel', { name: table.name, status: t(serviceTableStatus(table.primary_status).labelKey) })
}

</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <!-- Floor selector — a neutral segmented control, only when there is more than one floor -->
      <div
        v-if="floors.length > 1"
        class="inline-flex max-w-full flex-wrap gap-1 rounded-saloa-md bg-surface-subtle p-1"
        role="tablist"
        :aria-label="t('operations.floorMap.floorSelector')"
      >
        <button
          v-for="floor in floors"
          :key="floor.id"
          type="button"
          role="tab"
          :aria-selected="selectedFloorId === floor.id"
          class="min-h-11 rounded-saloa-sm px-3 text-label-lg transition-colors duration-fast ease-out pointer-fine:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          :class="selectedFloorId === floor.id ? 'bg-surface font-semibold text-fg shadow-raised' : 'font-medium text-fg-muted hover:text-fg'"
          @click="selectedFloorId = floor.id"
        >
          {{ floor.name }}
        </button>
      </div>

      <!-- Legend — each swatch repeats the table treatment and icon; the label is always visible, never colour alone -->
      <ul
        v-if="floors.length > 0 || unassignedTables.length > 0"
        class="flex flex-wrap gap-x-4 gap-y-2 text-label-md text-fg-muted"
      >
        <li v-for="status in LEGEND_STATUSES" :key="status" class="inline-flex items-center gap-1.5">
          <span class="inline-flex size-5 items-center justify-center rounded-saloa-sm border" :class="floorTableTone(status)" aria-hidden="true">
            <component :is="serviceTableStatus(status).icon" :size="12" :class="floorTableIconTone(status)" />
          </span>
          {{ t(serviceTableStatus(status).labelKey) }}
        </li>
      </ul>
    </div>

    <!-- No floors/zones/tables configured at all yet -->
    <EmptyState
      v-if="floors.length === 0 && unassignedTables.length === 0"
      :icon="PhArmchair"
      :message="t('operations.floorMap.empty')"
    />

    <template v-else>
      <div v-if="currentFloor" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section
          v-for="zone in currentFloor.zones"
          :key="zone.id"
          class="flex min-w-0 flex-col overflow-hidden rounded-saloa-lg border border-hairline bg-surface"
        >
          <div class="flex items-baseline justify-between gap-3 px-4 py-3">
            <h3 class="min-w-0 break-words text-component-title font-semibold text-fg">{{ zone.name }}</h3>
            <span class="shrink-0 text-label-md tabular-nums text-fg-muted">
              {{ t('operations.floorMap.tableCount', zone.tables.length) }}
            </span>
          </div>
          <EmptyState
            v-if="zone.tables.length === 0"
            :icon="PhArmchair"
            :message="t('operations.floorMap.zoneEmpty')"
          />
          <!-- The floor itself: a recessed plane under the raised table objects -->
          <div v-else class="relative min-h-80 flex-1 border-t border-hairline bg-surface-subtle">
            <FloorTableMarker
              v-for="table in zone.tables"
              :key="table.id"
              :table="table"
              :label="tableLabel(table)"
              :selected="selectedTableId === table.id"
              @select="emit('select-table', table)"
            />
          </div>
        </section>
      </div>

      <!-- Tables with no zone assigned yet — real positions may be null, so listed rather than canvas-placed -->
      <section v-if="unassignedTables.length > 0" class="flex flex-col gap-3">
        <h3 class="text-label-lg font-medium text-fg-muted">
          {{ t('operations.floorMap.unassigned') }}
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="table in unassignedTables"
            :key="table.id"
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-saloa-md border px-3 text-label-lg font-semibold transition-colors duration-fast ease-out hover:border-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            :class="[floorTableTone(table.primary_status), selectedTableId === table.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : '']"
            :aria-label="tableLabel(table)"
            :aria-pressed="selectedTableId === table.id"
            @click="emit('select-table', table)"
          >
            <component :is="serviceTableStatus(table.primary_status).icon" :size="16" :class="floorTableIconTone(table.primary_status)" aria-hidden="true" />
            {{ table.name }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
/*
 * The map is a quiet surface. In SALOA, status and geometry carry the signal;
 * a grid or ambient glow would add decoration without operational meaning.
 */
</style>
