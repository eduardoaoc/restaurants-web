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
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
      <div v-for="stat in stats" :key="stat.key" class="rounded-lg bg-surface-container-high p-3">
        <span class="block text-label-md text-on-surface-variant">{{ t(`operations.kitchen.status.${stat.key}`) }}</span>
        <span class="mt-1.5 block text-title-lg font-bold text-on-surface">{{ formatNumber(stat.value, locale) }}</span>
      </div>
    </div>
    <p class="text-body-md text-on-surface-variant">
      {{ t('operations.kitchen.activeOrders', { count: formatNumber(kitchen.active_orders, locale) }) }}
      <template v-if="kitchen.oldest_active_order_age_seconds !== null">
        · {{ t('operations.kitchen.oldestAge', { age: formatDuration(kitchen.oldest_active_order_age_seconds) }) }}
      </template>
    </p>
  </div>
</template>
