<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import type { OperationsTable } from '@/types/operations'
import { formatDuration } from '@/utils/format'
import { serviceTableStatus } from '@/utils/service-table-status'

const props = defineProps<{ table: OperationsTable }>()
const emit = defineEmits<{ select: [number] }>()
const { t } = useI18n()
const status = computed(() => serviceTableStatus(props.table.primary_status))
</script>

<template>
  <li class="min-w-0">
    <button
      type="button"
      class="flex min-h-28 w-full min-w-0 flex-col items-start gap-2 rounded-md border border-hairline bg-surface px-3 py-3 text-left shadow-raised transition-colors duration-fast hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:bg-surface-subtle"
      @click="emit('select', table.id)"
    >
      <span class="flex w-full min-w-0 items-start justify-between gap-2">
        <span class="min-w-0 break-words text-component-title font-semibold text-fg">{{ table.name }}</span>
        <span v-if="table.orders.waiting_approval > 0" class="shrink-0 rounded-sm bg-primary-subtle px-2 py-1 text-label-md font-semibold tabular-nums text-accent">
          {{ table.orders.waiting_approval }}
        </span>
      </span>
      <AStatusBadge :state="status.state" :label="t(status.labelKey)" :icon="status.icon" />
      <span v-if="table.session" class="flex w-full min-w-0 flex-wrap gap-x-3 gap-y-1 text-body-sm text-fg-muted">
        <span v-if="table.session.guest_count" class="tabular-nums">{{ t('tableDrawer.guests') }}: {{ table.session.guest_count }}</span>
        <span class="tabular-nums">{{ formatDuration(table.session.elapsed_seconds) }}</span>
      </span>
      <span v-if="table.session?.assigned_waiter?.name" class="max-w-full break-words text-body-sm text-fg-muted">
        {{ table.session.assigned_waiter.name }}
      </span>
    </button>
  </li>
</template>
