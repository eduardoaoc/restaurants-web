<script setup lang="ts">
import { computed } from 'vue'
import { Html } from '@tresjs/cientos'
import { formatElapsed } from './elapsed-time'

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
}>()

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
    :z-index-range="[10, 0]"
  >
    <div
      class="table-info-label"
      :class="{ 'table-info-label--available': occupiedAt === null || identityOnly }"
    >
      <span class="table-info-label__title">{{ title }}</span>
      <span
        v-if="!identityOnly"
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
  background: rgb(23 24 28 / 0.62);
  color: #f2eae3;
  font-family: inherit;
  line-height: 1.2;
  white-space: nowrap;
  user-select: none;
}

.table-info-label__title {
  font-size: 12px;
  font-weight: 600;
}

.table-info-label__detail {
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: rgb(242 234 227 / 0.72);
}

.table-info-label--available {
  background: rgb(23 24 28 / 0.45);
}

.table-info-label--available .table-info-label__title {
  color: rgb(242 234 227 / 0.8);
}
</style>
