<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhCookingPot, PhHandPalm, PhQueue } from '@phosphor-icons/vue'

import type { OperationsKitchen, OperationsSummary } from '@/types/operations'
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
  /** `kitchen.counts_by_status` of the same snapshot: splits "sent to the kitchen" from "being prepared". */
  counts?: OperationsKitchen['counts_by_status']
  oldest: OperationTiming | null
  timezone: string
}>()

const { t, locale } = useI18n()

// Everything here counts ORDERS, never dishes: the live contract carries no per-item quantities, so none is shown.
// Yellow = waiting on someone (moderate attention), green = finished and ready to serve; every state also has its own icon
// and label, so colour is never the only signal.
interface Stage { key: string; value: number; icon: Component; tone: 'warning' | 'neutral' | 'success' }
const stages = computed<Stage[]>(() => {
  const { counts, orders } = props
  return [
    { key: 'waiting', value: counts?.waiting_approval ?? orders.waiting_approval, icon: PhHandPalm, tone: 'warning' },
    { key: 'queued', value: counts ? counts.confirmed + counts.accepted : 0, icon: PhQueue, tone: 'neutral' },
    { key: 'preparing', value: counts?.preparing ?? orders.preparing, icon: PhCookingPot, tone: 'neutral' },
    { key: 'ready', value: counts?.ready ?? orders.ready, icon: PhCheckCircle, tone: 'success' },
  ].filter(stage => counts !== undefined || stage.key !== 'queued') as Stage[]
})
const TONE: Record<Stage['tone'], string> = { warning: 'text-warning', neutral: 'text-fg', success: 'text-success' }
</script>

<template>
  <div class="flex flex-col gap-3">
    <dl class="grid grid-cols-2 gap-2">
      <div v-for="stage in stages" :key="stage.key" class="min-w-0 rounded-saloa-md bg-surface-subtle px-3 py-2" :data-stage="stage.key">
        <dt class="flex items-center gap-1.5 break-words text-label-md text-fg-muted">
          <component :is="stage.icon" :size="14" class="shrink-0" :class="stage.value > 0 ? TONE[stage.tone] : ''" aria-hidden="true" />
          {{ t(`operations.board.kitchen.${stage.key}`) }}
        </dt>
        <dd class="mt-0.5 text-metric-sm tabular-nums" :class="stage.value > 0 ? TONE[stage.tone] : 'text-fg-muted'">{{ formatNumber(stage.value, locale) }} <span class="text-label-md font-normal text-fg-muted">{{ t('operations.board.kitchen.unit', stage.value) }}</span></dd>
      </div>
    </dl>
    <p class="text-label-md text-fg-muted">{{ t('operations.board.kitchen.note') }}</p>
    <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-hairline pt-3">
      <span class="text-label-md text-fg-muted">{{ t('operations.board.kitchen.oldest') }}</span>
      <OperationTimeLabel v-if="oldest" :timing="oldest" :timezone="timezone" class="text-body-sm font-semibold text-fg" />
      <span v-else class="text-body-sm text-fg-muted">{{ t('operations.board.kitchen.none') }}</span>
    </div>
  </div>
</template>
