<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArmchair, PhGauge, PhMinus, PhPlus, PhProhibit, PhUsers } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import FloorPlanCanvas from '@/components/tables/FloorPlanCanvas.vue'
import TableConfigPanel, { type ZoneOption } from '@/components/tables/TableConfigPanel.vue'
import TableQrPanel from '@/components/tables/TableQrPanel.vue'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { useFloorPlanEditor } from '@/composables/useFloorPlanEditor'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import type { FloorPlanTable, UpdateTablePayload } from '@/types/floor-plan'

/**
 * "Mesas" — the owner's permanent CONFIGURATION of the dining room, kept
 * deliberately apart from the Dashboard's real-time operation view
 * (CLAUDE.md Passo 2.7 §5). Here a table is created, named, sized, placed
 * and given its customer QR; whether it is free or occupied right now is a
 * Dashboard concern and is only ever *shown* here, never acted on.
 *
 * Reuses the existing useFloorPlanEditor composable and the shared
 * FloorPlanCanvas (the same drag/arrow-key model as the operational editor)
 * rather than introducing a second editor (§6).
 */
const { t } = useI18n()
const restaurantStore = useRestaurantStore()
const { can } = usePermissions()

const canManageTables = computed(() => can('manage_tables'))
const canManageFloorPlan = computed(() => can('manage_floor_plan'))

const editor = useFloorPlanEditor(() => restaurantStore.currentRestaurantId)

const selectedFloorId = ref<number | null>(null)
const selectedZoneId = ref<number | null>(null)
const selectedTableId = ref<number | null>(null)
const newFloorName = ref('')
const newZoneName = ref('')
const newTableName = ref('')
const newTableCapacity = ref(4)
const tableSaveError = ref<ApiError | null>(null)

async function reload(): Promise<void> {
  await editor.load()
  selectedFloorId.value = editor.floorPlan.value?.floors[0]?.id ?? null
  selectedZoneId.value = currentFloor.value?.zones[0]?.id ?? null
  selectedTableId.value = null
}

onMounted(reload)

/**
 * A restaurant switch must leave nothing of the previous one behind — the
 * plan, the selected floor/zone, the open table context and its QR all
 * belong to that restaurant only (§28).
 */
watch(
  () => restaurantStore.currentRestaurantId,
  () => {
    editor.discardDraft()
    selectedFloorId.value = null
    selectedZoneId.value = null
    selectedTableId.value = null
    tableSaveError.value = null
    void reload()
  },
)

const currentFloor = computed(() => editor.floorPlan.value?.floors.find((f) => f.id === selectedFloorId.value) ?? null)
const currentZone = computed(() => currentFloor.value?.zones.find((z) => z.id === selectedZoneId.value) ?? null)
const unassignedTables = computed(() => editor.floorPlan.value?.unassigned_tables ?? [])

const allTables = computed<FloorPlanTable[]>(() => {
  const plan = editor.floorPlan.value
  if (!plan) return []
  return [...plan.floors.flatMap((floor) => floor.zones.flatMap((zone) => zone.tables)), ...plan.unassigned_tables]
})

const selectedTable = computed(() => allTables.value.find((table) => table.id === selectedTableId.value) ?? null)

const zoneOptions = computed<ZoneOption[]>(
  () =>
    editor.floorPlan.value?.floors.flatMap((floor) =>
      floor.zones.map((zone) => ({ id: zone.id, name: zone.name, floorName: floor.name })),
    ) ?? [],
)

function selectFloor(id: number): void {
  selectedFloorId.value = id
  selectedZoneId.value = currentFloor.value?.zones[0]?.id ?? null
  selectedTableId.value = null
}

function selectZone(id: number): void {
  selectedZoneId.value = id
  selectedTableId.value = null
}

async function addFloor(): Promise<void> {
  const name = newFloorName.value.trim()
  if (!name) return
  if (await editor.createFloor(name)) {
    newFloorName.value = ''
    selectedFloorId.value = editor.floorPlan.value?.floors.at(-1)?.id ?? selectedFloorId.value
  }
}

async function addZone(): Promise<void> {
  const name = newZoneName.value.trim()
  if (!name || selectedFloorId.value === null) return
  if (await editor.createZone(name, selectedFloorId.value)) {
    newZoneName.value = ''
    selectedZoneId.value = currentFloor.value?.zones.at(-1)?.id ?? null
  }
}

/**
 * Suggested name follows the whole restaurant's numbering, never just the
 * current zone's — numbering per zone let two different tables both show up
 * as "Mesa 1" as soon as a second zone existed (real bug found in Passo 1.3).
 */
const suggestedTableName = computed(() => {
  const numbers = allTables.value.map((table) => table.number ?? 0).concat(allTables.value.length, 0)
  return t('operations.editor.tableName', { number: Math.max(...numbers) + 1 })
})

async function addTable(): Promise<void> {
  if (selectedZoneId.value === null) return
  const name = newTableName.value.trim() || suggestedTableName.value

  const created = await editor.createTable({
    name,
    capacity: newTableCapacity.value,
    zone_id: selectedZoneId.value,
    layout_x: 0.5,
    layout_y: 0.5,
  })

  if (created) newTableName.value = ''
}

async function saveTableConfig(payload: UpdateTablePayload): Promise<ApiError | null> {
  if (selectedTableId.value === null) return null
  const result = await editor.updateTable(selectedTableId.value, payload)
  tableSaveError.value = result
  return result
}

/**
 * Configuration status is expressed with shape/opacity + an icon, never
 * colour alone (docs/design-system.md §13): a blocked or retired table
 * reads as dashed and dimmed with a "prohibited" glyph, so it stays legible
 * for a colour-blind owner and in both themes.
 */
function markerClass(table: FloorPlanTable): string {
  if (table.status === 'active') return ''
  return 'border-dashed opacity-60'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-headline font-bold text-on-surface">{{ t('tables.pageTitle') }}</h2>
      <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('tables.pageSubtitle') }}</p>
    </div>

    <ASurface v-if="!canManageTables" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('tables.errors.forbidden') }}</p>
    </ASurface>

    <template v-else>
      <!-- Configuration vs operation, said out loud so the two screens never
           blur together in the owner's head (§5). -->
      <ASurface tone="container" radius="lg" bordered class="flex flex-wrap items-center justify-between gap-3 p-4">
        <div class="flex items-start gap-2">
          <PhArmchair :size="20" class="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
          <div>
            <p class="text-title-md font-medium text-on-surface">{{ t('tables.configVsOperation.title') }}</p>
            <p class="mt-0.5 text-body-md text-on-surface-variant">{{ t('tables.configVsOperation.subtitle') }}</p>
          </div>
        </div>
        <RouterLink
          :to="{ name: 'app-dashboard' }"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-label-lg font-medium text-primary hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <PhGauge :size="16" aria-hidden="true" />
          {{ t('tables.configVsOperation.cta') }}
        </RouterLink>
      </ASurface>

      <div v-if="editor.loading.value" class="flex items-center justify-center py-16">
        <AProgress />
      </div>

      <ASurface
        v-else-if="editor.error.value && !editor.floorPlan.value"
        tone="container"
        radius="lg"
        role="alert"
        class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
      >
        <p class="text-title-md font-medium">{{ describeApiError(editor.error.value, t) }}</p>
      </ASurface>

      <template v-else-if="editor.floorPlan.value">
        <!-- Floors -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-label-lg font-medium text-on-surface-variant">{{ t('tables.floorsLabel') }}</span>
          <button
            v-for="floor in editor.floorPlan.value.floors"
            :key="floor.id"
            type="button"
            class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="selectedFloorId === floor.id ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
            :aria-pressed="selectedFloorId === floor.id"
            @click="selectFloor(floor.id)"
          >
            {{ floor.name }}
          </button>

          <template v-if="canManageFloorPlan">
            <ATextField v-model="newFloorName" :label="t('tables.newFloor')" class="w-40" />
            <AIconButton
              :label="t('tables.addFloor')"
              :disabled="editor.saving.value || !newFloorName.trim()"
              @click="addFloor"
            >
              <PhPlus :size="16" />
            </AIconButton>
          </template>
        </div>

        <EmptyState
          v-if="editor.floorPlan.value.floors.length === 0"
          :icon="PhArmchair"
          :message="canManageFloorPlan ? t('tables.empty.noFloors') : t('tables.empty.noFloorsReadOnly')"
        />

        <template v-else-if="currentFloor">
          <!-- Zones -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-label-lg font-medium text-on-surface-variant">{{ t('tables.zonesLabel') }}</span>
            <button
              v-for="zone in currentFloor.zones"
              :key="zone.id"
              type="button"
              class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="selectedZoneId === zone.id ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'"
              :aria-pressed="selectedZoneId === zone.id"
              @click="selectZone(zone.id)"
            >
              {{ zone.name }}
            </button>

            <template v-if="canManageFloorPlan">
              <ATextField v-model="newZoneName" :label="t('tables.newZone')" class="w-40" />
              <AIconButton :label="t('tables.addZone')" :disabled="editor.saving.value || !newZoneName.trim()" @click="addZone">
                <PhPlus :size="16" />
              </AIconButton>
            </template>
          </div>

          <EmptyState
            v-if="currentFloor.zones.length === 0"
            :icon="PhArmchair"
            :message="canManageFloorPlan ? t('tables.empty.noZones') : t('tables.empty.noZonesReadOnly')"
          />

          <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <!-- Map -->
            <div class="flex flex-col gap-3">
              <div v-if="currentZone" class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-label-lg text-on-surface-variant">
                  {{ canManageFloorPlan ? t('tables.mapHint') : t('tables.mapHintReadOnly') }}
                </p>
                <div v-if="editor.hasUnsavedChanges.value" class="flex items-center gap-2">
                  <AButton variant="text" :disabled="editor.saving.value" @click="editor.discardDraft()">
                    {{ t('tables.discardLayout') }}
                  </AButton>
                  <AButton :loading="editor.saving.value" @click="editor.save()">{{ t('tables.saveLayout') }}</AButton>
                </div>
              </div>

              <FloorPlanCanvas
                v-if="currentZone"
                v-model:selected-table-id="selectedTableId"
                :tables="currentZone.tables"
                :layout-for="(table) => editor.mergedLayout(table.id, table.layout)"
                :movable="canManageFloorPlan"
                :marker-class="markerClass"
                @move="(tableId, position) => editor.updateDraft(tableId, position)"
              >
                <template #marker="{ table }">
                  <span class="text-label-md font-semibold">{{ table.name }}</span>
                  <span class="flex items-center gap-0.5 text-[10px] opacity-70">
                    <PhUsers v-if="table.has_active_session" :size="10" weight="fill" aria-hidden="true" />
                    <PhProhibit v-else-if="table.status !== 'active'" :size="10" aria-hidden="true" />
                    {{ table.capacity ?? '—' }}
                  </span>
                </template>
              </FloorPlanCanvas>

              <!-- Legend: every state is icon + text, never a bare colour. -->
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-label-md text-on-surface-variant">
                <span class="inline-flex items-center gap-1">
                  <PhUsers :size="14" weight="fill" aria-hidden="true" />{{ t('tables.legend.occupied') }}
                </span>
                <span class="inline-flex items-center gap-1">
                  <PhProhibit :size="14" aria-hidden="true" />{{ t('tables.legend.notActive') }}
                </span>
              </div>

              <!-- Create table -->
              <ASurface v-if="canManageTables && currentZone" tone="container" radius="lg" bordered class="flex flex-col gap-3 p-4">
                <p class="text-title-md font-medium text-on-surface">{{ t('tables.create.title') }}</p>
                <div class="flex flex-wrap items-end gap-3">
                  <ATextField
                    v-model="newTableName"
                    :label="t('tables.create.nameLabel')"
                    :placeholder="suggestedTableName"
                    class="min-w-40 flex-1"
                  />
                  <div>
                    <span class="text-label-lg font-medium text-on-surface-variant">{{ t('tables.config.capacityLabel') }}</span>
                    <div class="mt-1.5 flex items-center gap-2">
                      <AIconButton
                        :label="t('tables.config.capacityDecrease')"
                        :disabled="newTableCapacity <= 1 || editor.saving.value"
                        @click="newTableCapacity = Math.max(1, newTableCapacity - 1)"
                      >
                        <PhMinus :size="16" />
                      </AIconButton>
                      <span class="min-w-10 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-center text-body-lg tabular-nums text-on-surface">
                        {{ newTableCapacity }}
                      </span>
                      <AIconButton
                        :label="t('tables.config.capacityIncrease')"
                        :disabled="newTableCapacity >= 100 || editor.saving.value"
                        @click="newTableCapacity = Math.min(100, newTableCapacity + 1)"
                      >
                        <PhPlus :size="16" />
                      </AIconButton>
                    </div>
                  </div>
                  <AButton :loading="editor.saving.value" @click="addTable">
                    <template #leading><PhPlus :size="16" /></template>
                    {{ t('tables.create.cta') }}
                  </AButton>
                </div>
              </ASurface>

              <!-- Tables with no zone yet — never dropped from the UI. -->
              <ASurface v-if="unassignedTables.length > 0" tone="container" radius="lg" bordered class="p-4">
                <p class="text-title-md font-medium text-on-surface">{{ t('tables.unassigned.title') }}</p>
                <p class="mt-0.5 text-body-md text-on-surface-variant">{{ t('tables.unassigned.subtitle') }}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    v-for="table in unassignedTables"
                    :key="table.id"
                    type="button"
                    class="inline-flex min-h-11 items-center rounded-lg border border-outline-variant px-3 text-label-lg text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :class="selectedTableId === table.id ? 'ring-2 ring-primary' : ''"
                    :aria-pressed="selectedTableId === table.id"
                    @click="selectedTableId = table.id"
                  >
                    {{ table.name }}
                  </button>
                </div>
              </ASurface>
            </div>

            <!-- Selected table -->
            <div class="flex flex-col gap-4">
              <template v-if="selectedTable">
                <TableConfigPanel
                  :key="selectedTable.id"
                  :table="selectedTable"
                  :zones="zoneOptions"
                  :can-manage-tables="canManageTables"
                  :can-manage-floor-plan="canManageFloorPlan"
                  :saving="editor.saving.value"
                  :error="tableSaveError"
                  :on-save="saveTableConfig"
                />
                <TableQrPanel :table="selectedTable" />
              </template>

              <ASurface v-else tone="container" radius="lg" bordered class="p-6">
                <p class="text-body-md text-on-surface-variant">{{ t('tables.selectHint') }}</p>
              </ASurface>
            </div>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
