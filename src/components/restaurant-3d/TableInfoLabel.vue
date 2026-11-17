<script setup lang="ts">
import { computed } from 'vue'
import { Html } from '@tresjs/cientos'
import { formatElapsed } from './elapsed-time'
import { LABEL_Z_RANGE } from './operational-hierarchy'
import { useEdgeClamp } from './use-edge-clamp'
import { overlayViewport } from './overlay-viewport'
import { sceneAppearance } from './scene-appearance'

/**
 * Persistent table identity + occupancy ("Mesa 05 / 4 pers. · 38 min", or
 * "Mesa 01 / Disponible"). Quiet by design — smaller and more transparent than
 * the OperationalBadge, which must always read as the stronger element.
 * Render as a child of a label anchor. Spanish strings are lab-local, like the
 * badge copy (shared i18n is intentionally untouched).
 */
const props = defineProps<{
  tableNumber: number
  /** `state.guests.length` — never a separate count. */
  guestCount: number
  /** `null` while the table is available. */
  occupiedAt: string | null
  /** Shared clock value (ms). */
  now: number
  /** Table name only (layout editing): no occupancy line. */
  identityOnly?: boolean
  mappingState?: 'unmapped' | 'mapped' | 'missing' | 'conflict'
  mappingLabel?: string
}>()

const { calculatePosition, attrs: overlayAttrs } = useEdgeClamp('label')
/** Light stage: a floating numbered pin ("3") instead of the "Mesa 03" pill; the occupancy line stays a small caption. */
const pin = computed(() => String(props.tableNumber))
const title = computed(() => `Mesa ${String(props.tableNumber).padStart(2, '0')}`)
const detail = computed(() =>
  props.occupiedAt === null
    ? 'Disponible'
    : `${props.guestCount} pers. · ${formatElapsed(props.occupiedAt, props.now)}`,
)
</script>

<template>
  <Html
    center
    :pointer-events="'none'"
    :z-index-range="LABEL_Z_RANGE"
    :calculate-position="calculatePosition"
  >
    <div
      v-bind="overlayAttrs"
      class="table-info-label"
      :class="{ 'table-info-label--available': occupiedAt === null || identityOnly, 'table-info-label--pin': sceneAppearance.light }"
    >
      <span v-if="sceneAppearance.light" class="table-info-label__pin" :aria-label="title">{{ pin }}</span>
      <span v-else class="table-info-label__title">{{ title }}</span>
      <span
        v-if="identityOnly && mappingLabel"
        class="table-info-label__mapping"
        :class="`table-info-label__mapping--${mappingState ?? 'unmapped'}`"
      >{{ mappingLabel }}</span>
      <!-- Occupancy line only while the tables are far enough apart on screen to hold it (see overlay-viewport.ts). -->
      <span
        v-if="!identityOnly && overlayViewport.labelDetail && !(sceneAppearance.light && occupiedAt === null)"
        class="table-info-label__detail"
      >{{ detail }}</span>
    </div>
  </Html>
</template>

<style scoped>
.table-info-label {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 9px;
  border-radius: 10px;
  background: rgb(23 24 28 / 0.78);
  color: #f2eae3;
  font-family: inherit;
  line-height: 1.2;
  white-space: nowrap;
  user-select: none;
  position: relative;
}

/* Leader: when the collision layout moves a label away from its table, a thin tail and an anchor dot keep the
   association unambiguous. Vars and the data-leader flag come from use-edge-clamp; without the flag nothing is drawn. The tail sits behind
   the label (negative z-index in the Html wrapper's stacking context) so it appears to leave the pill's edge. */
.table-info-label::before,
.table-info-label::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  pointer-events: none;
  display: none;
}
.table-info-label::before {
  z-index: -1;
  width: var(--leader-len, 0px);
  height: 2px;
  margin-top: -1px;
  background: rgb(23 24 28 / 0.78);
  transform-origin: 0 50%;
  transform: rotate(var(--leader-angle, 0rad));
}
.table-info-label::after {
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: 999px;
  background: rgb(23 24 28 / 0.9);
  box-shadow: 0 0 0 1.5px rgb(242 234 227 / 0.7);
  transform: translate(var(--leader-dx, 0px), var(--leader-dy, 0px));
}
.table-info-label[data-leader]::before,
.table-info-label[data-leader]::after { display: block; }

.table-info-label__title {
  font-size: 12px;
  font-weight: 600;
}

.table-info-label__detail {
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: rgb(242 234 227 / 0.88);
}

.table-info-label__mapping {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}
.table-info-label__mapping--mapped { background: #244734; color: #b8edc7; }
.table-info-label__mapping--unmapped { background: #3b3b3b; color: #f2eae3; }
.table-info-label__mapping--missing, .table-info-label__mapping--conflict { background: #632c27; color: #ffd8d3; }

.table-info-label--available {
  background: rgb(23 24 28 / 0.7);
}

.table-info-label--available .table-info-label__title {
  color: rgb(242 234 227 / 0.92);
}

/* Light stage: white pin with a soft shadow, orange numeral; the caption is a small white capsule. */
.table-info-label--pin { background: transparent; padding: 0; gap: 3px; }
.table-info-label__pin {
  display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 999px;
  background: #fff; color: #7a3a00; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 2px rgb(40 30 20 / 0.28), 0 4px 10px rgb(40 30 20 / 0.16);
}
.table-info-label--pin .table-info-label__detail {
  padding: 1px 7px; border-radius: 999px; background: rgb(255 255 255 / 0.92); color: #4a3a2c;
  box-shadow: 0 1px 2px rgb(40 30 20 / 0.2);
}

@media (max-width: 640px) {
  .table-info-label { padding: 3px 7px; border-radius: 8px; }
  .table-info-label__title { font-size: 11px; }
  .table-info-label__detail { font-size: 10px; }
}
</style>
