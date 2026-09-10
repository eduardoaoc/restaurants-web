<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArmchair, PhPlus } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { useFloorPlanEditor } from '@/composables/useFloorPlanEditor'
import { describeApiError } from '@/utils/error-message'

const props = defineProps<{ restaurantId: number | null }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const editor = useFloorPlanEditor(() => props.restaurantId)

const selectedFloorId = ref<number | null>(null)
const selectedZoneId = ref<number | null>(null)
const selectedTableId = ref<number | null>(null)
const newFloorName = ref('')
const newZoneName = ref('')
const confirmingDiscard = ref(false)
const zoneCanvasRefs: Record<number, HTMLElement | null> = {}

onMounted(async () => {
  await editor.load()
  selectedFloorId.value = editor.floorPlan.value?.floors[0]?.id ?? null
})

const currentFloor = computed(() => editor.floorPlan.value?.floors.find((f) => f.id === selectedFloorId.value) ?? null)
const currentZone = computed(() => currentFloor.value?.zones.find((z) => z.id === selectedZoneId.value) ?? null)

function selectFloor(id: number): void {
  selectedFloorId.value = id
  selectedZoneId.value = null
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

async function addTable(capacity: 2 | 4): Promise<void> {
  if (selectedZoneId.value === null) return
  const existingNumbers = (currentZone.value?.tables ?? [])
    .map((table) => table.number ?? 0)
    .concat(0)
  const nextNumber = Math.max(...existingNumbers) + 1
  await editor.createTable(t('operations.editor.tableName', { number: nextNumber }), selectedZoneId.value, capacity)
}

function onPointerDown(zoneId: number, tableId: number, event: PointerEvent): void {
  event.preventDefault()
  selectedTableId.value = tableId
  const canvas = zoneCanvasRefs[zoneId]
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()

  const move = (moveEvent: PointerEvent): void => {
    const x = Math.min(Math.max((moveEvent.clientX - rect.left) / rect.width, 0), 1)
    const y = Math.min(Math.max((moveEvent.clientY - rect.top) / rect.height, 0), 1)
    editor.updateDraft(tableId, { x, y })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function cycleShape(tableId: number, current: string): void {
  const order = ['round', 'square', 'rectangle']
  const next = order[(order.indexOf(current) + 1) % order.length]
  editor.updateDraft(tableId, { shape: next })
}

function requestClose(): void {
  if (editor.hasUnsavedChanges.value) {
    confirmingDiscard.value = true
    return
  }
  emit('close')
}

function discardAndClose(): void {
  editor.discardDraft()
  confirmingDiscard.value = false
  emit('close')
}

async function saveAndClose(): Promise<void> {
  if (await editor.save()) emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <ASurface tone="high" radius="lg" class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden shadow-elevated">
      <div class="flex items-center justify-between border-b border-outline-variant px-5 py-4">
        <h3 class="text-title-lg font-semibold text-on-surface">{{ t('operations.editor.title') }}</h3>
        <div class="flex items-center gap-2">
          <AButton variant="text" :disabled="editor.saving.value" @click="requestClose">{{ t('common.cancel') }}</AButton>
          <AButton :loading="editor.saving.value" :disabled="!editor.hasUnsavedChanges.value" @click="saveAndClose">
            {{ t('common.save') }}
          </AButton>
        </div>
      </div>

      <div v-if="confirmingDiscard" class="flex items-center justify-between gap-3 bg-warning-container px-5 py-3 text-on-warning-container">
        <p class="text-body-md">{{ t('operations.editor.unsavedChanges') }}</p>
        <div class="flex gap-2">
          <AButton variant="text" @click="confirmingDiscard = false">{{ t('operations.editor.keepEditing') }}</AButton>
          <AButton variant="outlined" @click="discardAndClose">{{ t('operations.editor.discard') }}</AButton>
        </div>
      </div>

      <p v-if="editor.error.value" class="mx-5 mt-3 rounded-md bg-critical-container px-3 py-2 text-label-lg text-on-critical-container">
        {{ describeApiError(editor.error.value, t) }}
      </p>

      <div class="flex-1 overflow-y-auto p-5">
        <div v-if="editor.loading.value" class="flex justify-center py-16">
          <AProgress />
        </div>

        <template v-else-if="editor.floorPlan.value">
          <!-- Floor selector -->
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="floor in editor.floorPlan.value.floors"
              :key="floor.id"
              type="button"
              class="rounded-full px-3 py-1.5 text-label-lg font-medium"
              :class="selectedFloorId === floor.id ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              @click="selectFloor(floor.id)"
            >
              {{ floor.name }}
            </button>
            <ATextField v-model="newFloorName" :label="t('operations.editor.newFloor')" class="w-40" />
            <AIconButton :label="t('operations.editor.addFloor')" @click="addFloor">
              <PhPlus :size="16" />
            </AIconButton>
          </div>

          <EmptyState
            v-if="editor.floorPlan.value.floors.length === 0"
            :icon="PhArmchair"
            :message="t('operations.editor.noFloors')"
            class="mt-6"
          />

          <template v-else-if="currentFloor">
            <!-- Zone selector -->
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <button
                v-for="zone in currentFloor.zones"
                :key="zone.id"
                type="button"
                class="rounded-full px-3 py-1.5 text-label-lg font-medium"
                :class="selectedZoneId === zone.id ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'"
                @click="selectedZoneId = zone.id"
              >
                {{ zone.name }}
              </button>
              <ATextField v-model="newZoneName" :label="t('operations.editor.newZone')" class="w-40" />
              <AIconButton :label="t('operations.editor.addZone')" @click="addZone">
                <PhPlus :size="16" />
              </AIconButton>
            </div>

            <EmptyState
              v-if="currentFloor.zones.length === 0"
              :icon="PhArmchair"
              :message="t('operations.editor.noZones')"
              class="mt-6"
            />

            <template v-else-if="currentZone">
              <!-- Table palette -->
              <div class="mt-4 flex gap-2">
                <AButton variant="outlined" :disabled="editor.saving.value" @click="addTable(2)">
                  {{ t('operations.editor.addTableSeats', 2) }}
                </AButton>
                <AButton variant="outlined" :disabled="editor.saving.value" @click="addTable(4)">
                  {{ t('operations.editor.addTableSeats', 4) }}
                </AButton>
              </div>

              <p class="mt-2 text-label-md text-on-surface-variant">{{ t('operations.editor.hint') }}</p>

              <div
                :ref="(el) => (zoneCanvasRefs[currentZone!.id] = el as HTMLElement)"
                class="relative mt-3 min-h-72 select-none rounded-xl border border-dashed border-outline-variant bg-surface-container-low"
              >
                <button
                  v-for="tableItem in currentZone.tables"
                  :key="tableItem.id"
                  type="button"
                  class="absolute flex flex-col items-center justify-center gap-0.5 border border-outline bg-surface-container-highest text-on-surface shadow-card"
                  :class="[
                    editor.mergedLayout(tableItem.id, tableItem.layout).shape === 'round' ? 'rounded-full' : 'rounded-lg',
                    selectedTableId === tableItem.id ? 'ring-2 ring-primary' : '',
                  ]"
                  :style="{
                    left: `${(editor.mergedLayout(tableItem.id, tableItem.layout).x ?? 0.5) * 100}%`,
                    top: `${(editor.mergedLayout(tableItem.id, tableItem.layout).y ?? 0.5) * 100}%`,
                    width: `${editor.mergedLayout(tableItem.id, tableItem.layout).width}px`,
                    height: `${editor.mergedLayout(tableItem.id, tableItem.layout).height}px`,
                    transform: `translate(-50%, -50%) rotate(${editor.mergedLayout(tableItem.id, tableItem.layout).rotation}deg)`,
                    cursor: 'grab',
                  }"
                  @pointerdown="onPointerDown(currentZone!.id, tableItem.id, $event)"
                  @click="selectedTableId = tableItem.id"
                >
                  <span class="text-label-md font-semibold">{{ tableItem.name }}</span>
                  <span class="text-[10px] opacity-70">{{ tableItem.capacity ?? '—' }}</span>
                </button>
              </div>

              <div v-if="selectedTableId" class="mt-3 flex items-center gap-2">
                <AButton
                  variant="text"
                  @click="cycleShape(selectedTableId, editor.mergedLayout(selectedTableId, currentZone.tables.find((tb) => tb.id === selectedTableId)!.layout).shape)"
                >
                  {{ t('operations.editor.cycleShape') }}
                </AButton>
              </div>
            </template>
          </template>
        </template>
      </div>
    </ASurface>
  </div>
</template>
