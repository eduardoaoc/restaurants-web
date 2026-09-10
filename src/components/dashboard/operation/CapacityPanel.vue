<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ProgressRing from '@/components/dashboard/ProgressRing.vue'
import type { OperationsTable } from '@/types/operations'
import { formatNumber } from '@/utils/format'

const props = defineProps<{
  tables: OperationsTable[]
  activeGuests: number
  occupiedTables: number
  totalTables: number
}>()

const { t, locale } = useI18n()

/**
 * Display-only derivation from already-fetched numbers (CLAUDE.md §48): the
 * Live snapshot gives per-table `capacity` but no aggregate "total seats" /
 * "available seats" field, so this sums it here for display — never
 * persisted, never sent back to the API, never treated as a source of
 * truth anywhere else.
 */
const totalSeats = computed(() => props.tables.reduce((sum, table) => sum + (table.capacity ?? 0), 0))
const availableSeats = computed(() => Math.max(totalSeats.value - props.activeGuests, 0))
const ratio = computed(() => (totalSeats.value > 0 ? Math.min(props.activeGuests / totalSeats.value, 1) : 0))
</script>

<template>
  <div class="flex items-center gap-4">
    <ProgressRing :value="ratio" :size="72" :label="t('operations.capacity.title')" :center-text="`${Math.round(ratio * 100)}%`" />
    <div>
      <p class="text-title-md font-semibold text-on-surface">
        {{ t('operations.capacity.guestsOfSeats', { guests: formatNumber(activeGuests, locale), seats: formatNumber(totalSeats, locale) }) }}
      </p>
      <p class="text-label-md text-on-surface-variant">
        {{ t('operations.capacity.tables', { occupied: formatNumber(occupiedTables, locale), total: formatNumber(totalTables, locale) }) }}
      </p>
      <p class="text-label-md text-on-surface-variant">{{ t('operations.capacity.available', { count: formatNumber(availableSeats, locale) }) }}</p>
    </div>
  </div>
</template>
