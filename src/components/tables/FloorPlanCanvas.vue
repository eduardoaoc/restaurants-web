<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FloorPlanTable, FloorPlanTableLayout } from '@/types/floor-plan'

/**
 * The one draggable floor-plan canvas in the app (CLAUDE.md §17 — no
 * near-duplicate components). Extracted from FloorMapEditor in Passo 2.7 so
 * the operational editor (Dashboard modal) and the administrative Mesas
 * view share exactly the same interaction model instead of drifting apart:
 * normalized 0..1 coordinates, pointer drag, and an arrow-key alternative
 * for keyboard users.
 *
 * Purely presentational: it never talks to a service and never owns the
 * draft — it reports a new position and lets the caller decide what that
 * means (a local layout draft here, a bulk PATCH later).
 */
const props = defineProps<{
  tables: FloorPlanTable[]
  /** Resolves the layout actually shown (base layout merged with any local draft). */
  layoutFor: (table: FloorPlanTable) => FloorPlanTableLayout
  selectedTableId: number | null
  /** When false the markers stay focusable/selectable but can no longer be moved. */
  movable?: boolean
  /** Optional per-table classes, e.g. to express configuration status without relying on colour alone. */
  markerClass?: (table: FloorPlanTable) => string
}>()

const emit = defineEmits<{
  'update:selectedTableId': [number]
  move: [tableId: number, position: { x: number; y: number }]
}>()

const { t } = useI18n()

const canvas = ref<HTMLElement | null>(null)

function onPointerDown(tableId: number, event: PointerEvent): void {
  emit('update:selectedTableId', tableId)
  if (props.movable === false) return

  event.preventDefault()
  // preventDefault() above (needed to stop native drag/text-selection
  // artifacts while dragging) also suppresses the browser's default
  // focus-on-click for the button — found via real keyboard testing in
  // Passo 1.3, this silently broke the arrow-key nudge for anyone who
  // clicked a table first instead of Tab-ing to it. Restore focus explicitly.
  ;(event.currentTarget as HTMLElement).focus()

  const element = canvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()

  const move = (moveEvent: PointerEvent): void => {
    const x = Math.min(Math.max((moveEvent.clientX - rect.left) / rect.width, 0), 1)
    const y = Math.min(Math.max((moveEvent.clientY - rect.top) / rect.height, 0), 1)
    emit('move', tableId, { x, y })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/**
 * Keyboard alternative to the pointer drag — arrow keys nudge by 2% of the
 * canvas per press, clamped to the same 0..1 range as a drag (§34: the
 * editor must never be pointer-only).
 */
function onKeydown(tableId: number, layout: FloorPlanTableLayout, event: KeyboardEvent): void {
  if (props.movable === false) return

  const step = 0.02
  let dx = 0
  let dy = 0
  if (event.key === 'ArrowLeft') dx = -step
  else if (event.key === 'ArrowRight') dx = step
  else if (event.key === 'ArrowUp') dy = -step
  else if (event.key === 'ArrowDown') dy = step
  else return

  event.preventDefault()
  emit('move', tableId, {
    x: Math.min(Math.max((layout.x ?? 0.5) + dx, 0), 1),
    y: Math.min(Math.max((layout.y ?? 0.5) + dy, 0), 1),
  })
}
</script>

<template>
  <div
    ref="canvas"
    class="relative min-h-72 select-none rounded-xl border border-dashed border-outline-variant bg-surface-container-low"
  >
    <button
      v-for="table in tables"
      :key="table.id"
      type="button"
      class="absolute flex flex-col items-center justify-center gap-0.5 border border-outline bg-surface-container-highest text-on-surface shadow-card transition-shadow duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="[
        layoutFor(table).shape === 'round' ? 'rounded-full' : 'rounded-lg',
        selectedTableId === table.id ? 'ring-2 ring-primary' : '',
        markerClass ? markerClass(table) : '',
      ]"
      :style="{
        left: `${(layoutFor(table).x ?? 0.5) * 100}%`,
        top: `${(layoutFor(table).y ?? 0.5) * 100}%`,
        width: `${layoutFor(table).width}px`,
        height: `${layoutFor(table).height}px`,
        transform: `translate(-50%, -50%) rotate(${layoutFor(table).rotation}deg)`,
        cursor: movable === false ? 'pointer' : 'grab',
      }"
      :aria-label="t('operations.editor.tableAriaLabel', { name: table.name })"
      :aria-pressed="selectedTableId === table.id"
      @pointerdown="onPointerDown(table.id, $event)"
      @keydown="onKeydown(table.id, layoutFor(table), $event)"
      @click="emit('update:selectedTableId', table.id)"
    >
      <slot name="marker" :table="table" :layout="layoutFor(table)">
        <span class="text-label-md font-semibold">{{ table.name }}</span>
        <span class="text-[10px] opacity-70">{{ table.capacity ?? '—' }}</span>
      </slot>
    </button>
  </div>
</template>
