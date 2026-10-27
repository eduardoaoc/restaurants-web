<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { OperationsTable } from '@/types/operations'
import { formatNumber } from '@/utils/format'

const props = defineProps<{
  tables: OperationsTable[]
  activeGuests: number
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
</script>

<template>
  <div class="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-fg-muted">
    <span class="tabular-nums">
      {{ t('operations.capacity.guestsOfSeats', { guests: formatNumber(activeGuests, locale), seats: formatNumber(totalSeats, locale) }) }}
    </span>
    <span class="tabular-nums">{{ t('operations.capacity.available', { count: formatNumber(availableSeats, locale) }) }}</span>
  </div>
</template>
