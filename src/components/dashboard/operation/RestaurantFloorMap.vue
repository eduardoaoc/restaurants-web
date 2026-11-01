<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArmchair, PhClockCounterClockwise, PhUserCircleMinus } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import type { OperationsFloor, OperationsTable, TablePrimaryStatus } from '@/types/operations'
import { serviceTableStatus } from '@/utils/service-table-status'
import FloorTableMarker from './FloorTableMarker.vue'
import { extraTableSignals } from './floor-table-signals'
import { floorTableIconTone, floorTableTone } from './floor-table-tone'

const props = withDefaults(defineProps<{
  floors: OperationsFloor[]
  unassignedTables: OperationsTable[]
  selectedTableId: number | null
  /** Tables whose active session started before the current operational day (utils/operation-timing.ts). */
  previousSessionTableIds?: ReadonlySet<number>
}>(), { previousSessionTableIds: () => new Set<number>() })

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

// A table selected from outside the map (the attention queue) may live on
// another floor — follow it, so the focused table is always on screen.
watch(
  () => props.selectedTableId,
  (id) => {
    if (id === null) return
    const floor = props.floors.find((candidate) => candidate.zones.some((zone) => zone.tables.some((table) => table.id === id)))
    if (floor) selectedFloorId.value = floor.id
  },
  { immediate: true },
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
  const base = t('operations.floorMap.tableLabel', { name: table.name, status: t(serviceTableStatus(table.primary_status).labelKey) })
  const extras = extraTableSignals(table).map((signal) => t(signal.labelKey))
  if (table.flags.includes('unassigned')) extras.push(t('operations.board.queue.unassigned'))
  if (props.previousSessionTableIds.has(table.id)) extras.push(t('operations.board.timing.previousSession'))
  return extras.length ? `${base}. ${t('operations.board.floor.signals', { signals: extras.join(', ') })}` : base
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <!-- Floor selector — a neutral segmented control, only when there is more than one floor -->
    <div
      v-if="floors.length > 1"
      class="inline-flex max-w-full self-start flex-wrap gap-1 rounded-saloa-md bg-surface-subtle p-1"
      role="tablist"
      :aria-label="t('operations.floorMap.floorSelector')"
    >
      <button
        v-for="floor in floors"
        :key="floor.id"
        type="button"
        role="tab"
        :aria-selected="selectedFloorId === floor.id"
        class="min-h-11 max-w-full break-words rounded-saloa-sm px-3 text-label-lg transition-colors duration-fast ease-out pointer-fine:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        :class="selectedFloorId === floor.id ? 'bg-surface font-semibold text-fg shadow-raised' : 'font-medium text-fg-muted hover:text-fg'"
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
      <div v-if="currentFloor" class="flex min-w-0 flex-col gap-3">
        <EmptyState v-if="currentFloor.zones.length === 0" :icon="PhArmchair" :message="t('operations.floorMap.zoneEmpty')" />
        <section
          v-for="zone in currentFloor.zones"
          :key="zone.id"
          class="flex min-w-0 flex-col overflow-hidden rounded-saloa-md border border-hairline"
        >
          <div class="flex items-baseline justify-between gap-3 bg-surface px-3 py-2">
            <h3 class="min-w-0 break-words text-label-lg font-semibold text-fg">{{ zone.name }}</h3>
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
          <div v-else class="relative min-h-64 flex-1 border-t border-hairline bg-surface-subtle">
            <FloorTableMarker
              v-for="table in zone.tables"
              :key="table.id"
              :table="table"
              :label="tableLabel(table)"
              :selected="selectedTableId === table.id"
              :previous-session="previousSessionTableIds.has(table.id)"
              @select="emit('select-table', table)"
            />
          </div>
        </section>
      </div>

      <!-- Tables with no zone assigned yet — real positions may be null, so listed rather than canvas-placed -->
      <section v-if="unassignedTables.length > 0" class="flex flex-col gap-2">
        <h3 class="text-label-lg font-medium text-fg-muted">
          {{ t('operations.floorMap.unassigned') }}
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="table in unassignedTables"
            :key="table.id"
            type="button"
            class="flex min-h-11 max-w-full items-center gap-2 rounded-saloa-md border px-3 text-label-lg font-semibold transition-colors duration-fast ease-out hover:border-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            :class="[floorTableTone(table.primary_status), selectedTableId === table.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : '']"
            :aria-label="tableLabel(table)"
            :aria-pressed="selectedTableId === table.id"
            @click="emit('select-table', table)"
          >
            <component :is="serviceTableStatus(table.primary_status).icon" :size="16" :class="floorTableIconTone(table.primary_status)" aria-hidden="true" />
            <span class="min-w-0 break-words">{{ table.name }}</span>
          </button>
        </div>
      </section>

      <!-- Legend — each swatch repeats the table treatment and icon; the label is always visible, never colour alone -->
      <ul class="flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline pt-3 text-label-md text-fg-muted" :aria-label="t('operations.board.floor.legend')">
        <li v-for="status in LEGEND_STATUSES" :key="status" class="inline-flex items-center gap-1.5">
          <span class="inline-flex size-5 items-center justify-center rounded-saloa-sm border" :class="floorTableTone(status)" aria-hidden="true">
            <component :is="serviceTableStatus(status).icon" :size="12" :class="floorTableIconTone(status)" />
          </span>
          {{ t(serviceTableStatus(status).labelKey) }}
        </li>
        <li class="inline-flex items-center gap-1.5">
          <PhUserCircleMinus :size="16" weight="fill" class="text-danger" aria-hidden="true" />
          {{ t('operations.board.queue.unassigned') }}
        </li>
        <li class="inline-flex items-center gap-1.5">
          <PhClockCounterClockwise :size="16" aria-hidden="true" />
          {{ t('operations.board.timing.previousSession') }}
        </li>
      </ul>
    </template>
  </div>
</template>
