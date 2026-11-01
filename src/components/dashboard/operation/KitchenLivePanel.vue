<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { OperationsSummary } from '@/types/operations'
import { formatNumber } from '@/utils/format'
import type { OperationTiming } from '@/utils/operation-timing'
import OperationTimeLabel from './OperationTimeLabel.vue'

// Deliberately NOT shown: a load percentage, a "meta 15 min" target, an
// "atrasados" (overdue) count, or an average prep time — none of these
// exist on the Live read model (that's historical/Analytics territory). The
// three stages are summary.orders' own backend counts; the oldest age is
// kitchen.oldest_active_order_age_seconds, classified against the
// operational day so a leftover order never reads as a live wait.
const props = defineProps<{
  orders: OperationsSummary['orders']
  oldest: OperationTiming | null
  timezone: string
}>()

const { t, locale } = useI18n()

const stages = computed(() => [
  { key: 'waiting', value: props.orders.waiting_approval },
  { key: 'preparing', value: props.orders.preparing },
  { key: 'ready', value: props.orders.ready },
])
</script>

<template>
  <div class="flex flex-col gap-3">
    <dl class="grid grid-cols-3 gap-2">
      <div v-for="stage in stages" :key="stage.key" class="min-w-0 rounded-saloa-md bg-surface-subtle px-3 py-2">
        <dt class="break-words text-label-md text-fg-muted">{{ t(`operations.board.kitchen.${stage.key}`) }}</dt>
        <dd class="mt-0.5 text-metric-sm tabular-nums" :class="stage.value > 0 ? 'text-fg' : 'text-fg-muted'">{{ formatNumber(stage.value, locale) }}</dd>
      </div>
    </dl>
    <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-hairline pt-3">
      <span class="text-label-md text-fg-muted">{{ t('operations.board.kitchen.oldest') }}</span>
      <OperationTimeLabel v-if="oldest" :timing="oldest" :timezone="timezone" class="text-body-sm font-semibold text-fg" />
      <span v-else class="text-body-sm text-fg-muted">{{ t('operations.board.kitchen.none') }}</span>
    </div>
  </div>
</template>
