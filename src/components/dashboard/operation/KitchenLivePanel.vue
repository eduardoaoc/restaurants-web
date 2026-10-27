<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { OperationsKitchen } from '@/types/operations'
import { formatDuration, formatNumber } from '@/utils/format'

const props = defineProps<{ kitchen: OperationsKitchen }>()

const { t, locale } = useI18n()

// Deliberately NOT shown: a load percentage, a "meta 15 min" target, an
// "atrasados" (overdue) count, or an average prep time — none of these
// exist on the Live read model (that's historical/Analytics territory, see
// kitchen.average_preparation_time_seconds there). Only counts_by_status /
// active_orders / oldest_active_order_age_seconds are real right now.
const stats = computed(() => [
  { key: 'waiting_approval', value: props.kitchen.counts_by_status.waiting_approval },
  { key: 'confirmed', value: props.kitchen.counts_by_status.confirmed },
  { key: 'accepted', value: props.kitchen.counts_by_status.accepted },
  { key: 'preparing', value: props.kitchen.counts_by_status.preparing },
  { key: 'ready', value: props.kitchen.counts_by_status.ready },
])
</script>

<template>
  <div class="overflow-hidden rounded-saloa-lg border border-hairline bg-surface">
    <dl class="grid grid-cols-2 border-b border-hairline">
      <div class="min-w-0 px-4 py-3">
        <dt class="text-label-md text-fg-muted">{{ t('kitchen.dashboard.activeOrders') }}</dt>
        <dd class="mt-1 text-metric-sm tabular-nums text-fg">{{ formatNumber(kitchen.active_orders, locale) }}</dd>
      </div>
      <div class="min-w-0 border-l border-hairline px-4 py-3">
        <dt class="text-label-md text-fg-muted">{{ t('kitchen.dashboard.oldestActive') }}</dt>
        <dd class="mt-1 break-words text-metric-sm tabular-nums text-fg">
          {{ kitchen.oldest_active_order_age_seconds !== null ? formatDuration(kitchen.oldest_active_order_age_seconds) : '—' }}
        </dd>
      </div>
    </dl>
    <dl class="divide-y divide-hairline">
      <div v-for="stat in stats" :key="stat.key" class="flex min-h-11 items-center justify-between gap-4 px-4 py-2">
        <dt class="min-w-0 break-words text-body-sm text-fg">{{ t(`operations.kitchen.status.${stat.key}`) }}</dt>
        <dd class="shrink-0 text-body-sm tabular-nums" :class="stat.value > 0 ? 'font-semibold text-fg' : 'text-fg-muted'">
          {{ formatNumber(stat.value, locale) }}
        </dd>
      </div>
    </dl>
  </div>
</template>
