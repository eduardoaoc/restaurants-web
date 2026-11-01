<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhClockCounterClockwise } from '@phosphor-icons/vue'

import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import type { OperationsTable } from '@/types/operations'
import { formatDuration } from '@/utils/format'
import { serviceTableStatus } from '@/utils/service-table-status'
import { floorTableTone } from './floor-table-tone'

withDefaults(defineProps<{
  tables: OperationsTable[]
  selectedTableId: number | null
  /** Sessions opened before the current operational day (utils/operation-timing.ts). */
  previousSessionTableIds?: ReadonlySet<number>
}>(), { previousSessionTableIds: () => new Set<number>() })
const emit = defineEmits<{ select: [OperationsTable] }>()
const { t } = useI18n()
</script>

<template>
  <ul v-if="tables.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3" :aria-label="t('operations.floorMap.title')">
    <li v-for="table in tables" :key="table.id" class="min-w-0">
      <button
        type="button"
        class="flex min-h-20 w-full min-w-0 flex-col items-start gap-2 rounded-saloa-md border p-3 text-left transition-colors duration-fast ease-out hover:border-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[.98]"
        :class="[floorTableTone(table.primary_status), selectedTableId === table.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : '']"
        :aria-pressed="selectedTableId === table.id"
        :aria-label="t('operations.floorMap.tableLabel', { name: table.name, status: t(serviceTableStatus(table.primary_status).labelKey) })"
        @click="emit('select', table)"
      >
        <span class="max-w-full break-words text-component-title font-semibold text-fg">{{ table.name }}</span>
        <AStatusBadge
          :state="serviceTableStatus(table.primary_status).state"
          :label="t(serviceTableStatus(table.primary_status).labelKey)"
          :icon="serviceTableStatus(table.primary_status).icon"
          class="max-w-full"
        />
        <span v-if="table.session" class="flex w-full min-w-0 flex-wrap gap-x-2 gap-y-1 text-label-md tabular-nums text-fg-muted">
          <span>{{ t('tableDrawer.guests') }}: {{ table.session.guest_count }}</span>
          <span v-if="previousSessionTableIds.has(table.id)" class="inline-flex items-center gap-1"><PhClockCounterClockwise :size="12" aria-hidden="true" />{{ t('operations.board.timing.previousSession') }}</span>
          <span v-else>{{ formatDuration(table.session.elapsed_seconds) }}</span>
        </span>
      </button>
    </li>
  </ul>
  <p v-else class="text-body-sm text-fg-muted">{{ t('operations.floorMap.empty') }}</p>
</template>
