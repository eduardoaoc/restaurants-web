<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhInfo, PhWarning, PhWarningCircle } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import type { OperationsAlert, OperationsAlertSeverity } from '@/types/operations'
import { formatDuration } from '@/utils/format'

const props = defineProps<{ alerts: OperationsAlert[] }>()
defineEmits<{ 'open-table': [number] }>()

const { t } = useI18n()

const SEVERITY_ORDER: OperationsAlertSeverity[] = ['critical', 'warning', 'info']
const SEVERITY_STYLE: Record<OperationsAlertSeverity, { icon: typeof PhWarning; tone: string }> = {
  critical: { icon: PhWarningCircle, tone: 'bg-critical-container text-on-critical-container' },
  warning: { icon: PhWarning, tone: 'bg-warning-container text-on-warning-container' },
  info: { icon: PhInfo, tone: 'bg-surface-container-high text-on-surface-variant' },
}

// Every alert `type` the backend can send today — an unknown future type
// falls back to a generic label rather than being hidden.
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

function typeLabel(type: string): string {
  const key = TYPE_LABEL_KEYS[type]
  return key ? t(key) : type
}

const grouped = computed(() =>
  SEVERITY_ORDER.map((severity) => ({
    severity,
    items: props.alerts.filter((alert) => alert.severity === severity),
  })).filter((group) => group.items.length > 0),
)
</script>

<template>
  <div class="flex max-h-[560px] flex-col gap-4 overflow-y-auto">
    <EmptyState v-if="alerts.length === 0" :icon="PhCheckCircle" :message="t('operations.alerts.empty')" />

    <div v-for="group in grouped" :key="group.severity" class="flex flex-col gap-2">
      <p class="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
        {{ t(`operations.alerts.severity.${group.severity}`) }}
      </p>
      <div
        v-for="alert in group.items"
        :key="alert.id"
        class="flex items-start gap-3 rounded-lg p-3 transition-colors duration-200 ease-out hover:bg-surface-container-high"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="SEVERITY_STYLE[group.severity].tone">
          <component :is="SEVERITY_STYLE[group.severity].icon" :size="18" aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-body-md font-medium text-on-surface">{{ typeLabel(alert.type) }}</p>
          <p class="text-label-md text-on-surface-variant">{{ t('operations.alerts.age', { age: formatDuration(alert.age_seconds) }) }}</p>
          <button
            v-if="alert.table_id !== null"
            type="button"
            class="mt-1.5 rounded-md px-2 py-1 text-label-md font-medium text-primary hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="$emit('open-table', alert.table_id)"
          >
            {{ t('operations.alerts.viewTable') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
