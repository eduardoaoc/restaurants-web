<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhCheckCircle, PhChefHat, PhClipboardText, PhClock, PhCookingPot, PhForkKnife, PhHourglass, PhListChecks, PhPackage,
} from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import BarList from '@/components/dashboard/BarList.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import MetricCard from '@/components/dashboard/MetricCard.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import KitchenQueueFlow from '@/components/kitchen/KitchenQueueFlow.vue'
import type { ApiError } from '@/api/errors'
import type { KitchenDashboard, KitchenStatus, KitchenTimingMetric } from '@/types/kitchen'
import { kitchenError } from '@/utils/kitchen-error'
import { formatDuration } from '@/utils/format'

const props = defineProps<{
  dashboard: KitchenDashboard | null
  loading: boolean
  error: ApiError | null
}>()
defineEmits<{ retry: []; 'select-tab': [KitchenStatus] }>()

const { t, locale } = useI18n()

function minutesLabel(seconds: number): string {
  return t('kitchen.minutes', { count: new Intl.NumberFormat(locale.value).format(Math.floor(seconds / 60)) })
}

function timestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

const TIMING_KEYS = ['accept', 'preparation', 'ready_to_served'] as const

function itemsSummary(items: { name: string; quantity: number }[]): string {
  return items.map((item) => `${item.quantity}× ${item.name}`).join(', ')
}

const topProductItems = computed(() => {
  const dashboard = props.dashboard
  if (!dashboard) return []
  return dashboard.top_products
    .slice(0, 5)
    .map((product) => ({
      key: String(product.product_id),
      label: product.name,
      value: product.quantity,
      displayValue: new Intl.NumberFormat(locale.value).format(product.quantity),
    }))
})

function timingMetric(key: (typeof TIMING_KEYS)[number]): KitchenTimingMetric | undefined {
  return props.dashboard?.timings[key]
}

const recentAccepted = computed(() => {
  const dashboard = props.dashboard
  if (!dashboard) return []
  return dashboard.recent_accepted.map((row) => ({ row, time: timestamp(row.accepted_at, dashboard.restaurant.timezone) }))
})

const recentReady = computed(() => {
  const dashboard = props.dashboard
  if (!dashboard) return []
  return dashboard.recent_ready.map((row) => ({
    row,
    time: timestamp(row.ready_at, dashboard.restaurant.timezone),
    servedTime: row.served_at === null ? null : timestamp(row.served_at, dashboard.restaurant.timezone),
  }))
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading && !dashboard" class="flex justify-center py-12"><AProgress /></div>
    <ASurface v-else-if="error" tone="low" radius="lg" class="flex flex-col items-start gap-3 p-6">
      <p role="alert" class="text-body-lg text-on-surface">{{ kitchenError(error, t) }}</p>
      <AButton variant="tonal" @click="$emit('retry')">{{ t('kitchen.retry') }}</AButton>
    </ASurface>

    <template v-else-if="dashboard">
      <!-- A. Estado de la cocina ahora -->
      <section :aria-label="t('kitchen.dashboard.sections.now')">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard :icon="PhListChecks" :label="t('kitchen.dashboard.activeOrders')" :value="String(dashboard.queue.active_orders)" />
          <MetricCard :icon="PhClipboardText" :label="t('kitchen.columns.confirmed')" :value="String(dashboard.queue.counts_by_status.confirmed)" />
          <MetricCard :icon="PhCheckCircle" :label="t('kitchen.columns.accepted')" :value="String(dashboard.queue.counts_by_status.accepted)" />
          <MetricCard :icon="PhCookingPot" :label="t('kitchen.columns.preparing')" :value="String(dashboard.queue.counts_by_status.preparing)" />
          <MetricCard :icon="PhPackage" :label="t('kitchen.columns.ready')" :value="String(dashboard.queue.counts_by_status.ready)" />
          <MetricCard :icon="PhClock" :label="t('kitchen.oldest')" :value="formatDuration(dashboard.queue.oldest_active_order_age_seconds)" />
          <MetricCard :icon="PhHourglass" :label="t('kitchen.dashboard.longestReadyWait')" :value="formatDuration(dashboard.queue.longest_ready_wait_seconds)" />
        </div>
      </section>

      <!-- B. Fluxo atual por status -->
      <SectionCard :icon="PhChefHat" :title="t('kitchen.dashboard.sections.flow')">
        <KitchenQueueFlow :counts="dashboard.queue.counts_by_status" @select="$emit('select-tab', $event)" />
      </SectionCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- C. Tempos operacionais -->
        <SectionCard :icon="PhHourglass" :title="t('kitchen.dashboard.sections.timings')">
          <div class="flex flex-col gap-3">
            <div v-for="key in TIMING_KEYS" :key="key" class="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high p-3">
              <div>
                <p class="text-body-md font-medium text-on-surface">{{ t(`kitchen.dashboard.timingLabels.${key}`) }}</p>
                <p class="text-label-md text-on-surface-variant">{{ t(`kitchen.dashboard.timingHelp.${key}`) }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-title-md font-semibold tabular-nums text-on-surface">
                  {{ timingMetric(key)?.average_seconds != null ? minutesLabel(timingMetric(key)!.average_seconds!) : t('kitchen.dashboard.noData') }}
                </p>
                <p class="text-label-md text-on-surface-variant">{{ t('kitchen.dashboard.samples', { count: timingMetric(key)?.orders ?? 0 }) }}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <!-- D. Top products -->
        <SectionCard :icon="PhForkKnife" :title="t('kitchen.dashboard.sections.topProducts')">
          <BarList :items="topProductItems" :empty-message="t('kitchen.dashboard.noTopProducts')" />
        </SectionCard>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- E. Últimos pedidos aceptados -->
        <SectionCard :icon="PhCheckCircle" :title="t('kitchen.dashboard.sections.recentAccepted')">
          <EmptyState v-if="!recentAccepted.length" :icon="PhCheckCircle" :message="t('kitchen.dashboard.emptyRecentAccepted')" />
          <ul v-else class="flex flex-col gap-3">
            <li v-for="entry in recentAccepted" :key="entry.row.order.id" class="flex flex-col gap-0.5 border-b border-outline-variant pb-2 last:border-0 last:pb-0">
              <div class="flex items-center justify-between gap-2 text-body-md font-medium text-on-surface">
                <span class="truncate">{{ entry.row.table.name }} · {{ entry.row.order.reference }}</span>
                <span class="shrink-0 tabular-nums text-label-md text-on-surface-variant">{{ entry.time }}</span>
              </div>
              <p class="truncate text-label-md text-on-surface-variant">{{ itemsSummary(entry.row.items) }}</p>
              <p v-if="entry.row.accepted_by" class="text-label-md text-on-surface-variant">{{ entry.row.accepted_by.name }}</p>
            </li>
          </ul>
        </SectionCard>

        <!-- F. Últimos pedidos listos -->
        <SectionCard :icon="PhPackage" :title="t('kitchen.dashboard.sections.recentReady')">
          <EmptyState v-if="!recentReady.length" :icon="PhPackage" :message="t('kitchen.dashboard.emptyRecentReady')" />
          <ul v-else class="flex flex-col gap-3">
            <li v-for="entry in recentReady" :key="entry.row.order.id" class="flex flex-col gap-0.5 border-b border-outline-variant pb-2 last:border-0 last:pb-0">
              <div class="flex items-center justify-between gap-2 text-body-md font-medium text-on-surface">
                <span class="truncate">{{ entry.row.table.name }} · {{ entry.row.order.reference }}</span>
                <span class="shrink-0 tabular-nums text-label-md text-on-surface-variant">{{ entry.time }}</span>
              </div>
              <p class="truncate text-label-md text-on-surface-variant">{{ itemsSummary(entry.row.items) }}</p>
              <p class="text-label-md" :class="entry.servedTime === null ? 'font-medium text-warning' : 'text-on-surface-variant'">
                {{ entry.servedTime === null ? t('kitchen.dashboard.waitingPickup') : entry.servedTime }}
              </p>
            </li>
          </ul>
        </SectionCard>
      </div>
    </template>
  </div>
</template>
