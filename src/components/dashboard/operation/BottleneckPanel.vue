<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarningCircle } from '@phosphor-icons/vue'

import type { OperationsBottleneck } from '@/types/operations'
import { formatDuration } from '@/utils/format'

defineProps<{ bottleneck: OperationsBottleneck | null }>()

const { t } = useI18n()

// Same type vocabulary as alerts — a bottleneck IS the worst current alert
// (highest severity, then affected_count, then oldest), never a separately
// invented "Cozinha 82%" figure, see CLAUDE.md §19.
const TYPE_LABEL_KEYS: Record<string, string> = {
  active_table_unassigned: 'operations.alerts.types.active_table_unassigned',
  assigned_waiter_off_shift: 'operations.alerts.types.assigned_waiter_off_shift',
  assigned_waiter_suspended: 'operations.alerts.types.assigned_waiter_suspended',
  customer_waiter_request_pending: 'operations.alerts.types.customer_waiter_request_pending',
  bill_request_pending: 'operations.alerts.types.bill_request_pending',
  responsible_waiter_call_pending: 'operations.alerts.types.responsible_waiter_call_pending',
  order_waiting_approval: 'operations.alerts.types.order_waiting_approval',
  order_ready: 'operations.alerts.types.order_ready',
}
</script>

<template>
  <div v-if="bottleneck" class="flex items-center gap-4">
    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-critical-container text-on-critical-container">
      <PhWarningCircle :size="22" aria-hidden="true" />
    </span>
    <div>
      <p class="text-title-md font-semibold text-on-surface">
        {{ TYPE_LABEL_KEYS[bottleneck.type] ? t(TYPE_LABEL_KEYS[bottleneck.type]) : bottleneck.type }}
      </p>
      <p class="text-label-md text-on-surface-variant">
        {{ t('operations.bottleneck.affected', bottleneck.affected_count) }}
        · {{ t('operations.bottleneck.oldest', { age: formatDuration(bottleneck.oldest_age_seconds) }) }}
      </p>
    </div>
  </div>

  <div v-else class="flex items-center gap-4">
    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success-container text-on-success-container">
      <PhCheckCircle :size="22" aria-hidden="true" />
    </span>
    <p class="text-body-md text-on-surface">{{ t('operations.bottleneck.none') }}</p>
  </div>
</template>
