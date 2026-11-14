<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import type { OperationsTable } from '@/types/operations'
import { formatDuration } from '@/utils/format'
import { serviceTableStatus } from '@/utils/service-table-status'

const props = defineProps<{ table: OperationsTable; timingPrevious?: boolean }>()
const emit = defineEmits<{ close: []; manage: [] }>()
const { t } = useI18n()

const status = computed(() => serviceTableStatus(props.table.primary_status))
const rows = computed(() => {
  const { table } = props
  const session = table.session
  const list: Array<{ key: string; label: string; value: string }> = [
    { key: 'capacity', label: t('operations.board.stage.table.capacity'), value: table.capacity == null ? '—' : String(table.capacity) },
  ]
  if (session) {
    list.push(
      { key: 'guests', label: t('tableDrawer.guests'), value: String(session.guest_count) },
      { key: 'elapsed', label: t('tableDrawer.elapsed'), value: formatDuration(session.elapsed_seconds) },
      { key: 'waiter', label: t('tableDrawer.waiter'), value: session.assigned_waiter?.name ?? '—' },
      { key: 'orders', label: t('operations.board.stage.table.openOrders'), value: String(table.orders.open_count) },
    )
  }
  return list
})
</script>

<template>
  <!-- Selected-table card over the scene (desktop): non-modal, so the room stays visible and clickable. Actions live in the existing details sheet. -->
  <section class="stage-panel flex max-h-full min-w-0 flex-col gap-2.5 overflow-y-auto rounded-saloa-lg p-3" :aria-label="table.name">
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="truncate text-title-md font-semibold text-fg">{{ table.name }}</h2>
        <AStatusBadge class="mt-1 max-w-full" :state="status.state" :label="t(status.labelKey)" :icon="status.icon" />
      </div>
      <AIconButton :label="t('operations.board.stage.table.close')" @click="emit('close')"><PhX /></AIconButton>
    </header>
    <p v-if="timingPrevious" class="text-label-md text-warning">{{ t('operations.board.timing.previousSession') }}</p>
    <dl class="grid grid-cols-2 gap-x-3 gap-y-1.5">
      <div v-for="row in rows" :key="row.key" class="min-w-0">
        <dt class="truncate text-label-md text-fg-muted">{{ row.label }}</dt>
        <dd class="truncate text-body-sm font-semibold tabular-nums text-fg">{{ row.value }}</dd>
      </div>
    </dl>
    <AButton variant="primary" size="sm" full-width @click="emit('manage')">{{ t('operations.board.stage.table.manage') }}</AButton>
  </section>
</template>
