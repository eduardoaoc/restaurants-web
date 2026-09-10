<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhChartPieSlice,
  PhClock,
  PhCookingPot,
  PhForkKnife,
  PhTable,
  PhTrophy,
  PhWallet,
} from '@phosphor-icons/vue'

import BarList from '@/components/dashboard/BarList.vue'
import DonutChart from '@/components/dashboard/DonutChart.vue'
import MetricCard from '@/components/dashboard/MetricCard.vue'
import ProgressRing from '@/components/dashboard/ProgressRing.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import PeakHoursChart from '@/components/dashboard/analytics/PeakHoursChart.vue'
import RevenueChart from '@/components/dashboard/analytics/RevenueChart.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import type { ApiError } from '@/api/errors'
import type { AnalyticsGranularity, AnalyticsQuery, RestaurantAnalytics } from '@/types/analytics'
import { formatDuration, formatMoney, formatNumber } from '@/utils/format'

const props = defineProps<{
  data: RestaurantAnalytics | null
  loading: boolean
  error: ApiError | null
}>()

const emit = defineEmits<{ 'change-query': [AnalyticsQuery] }>()

const { t, locale } = useI18n()

type Preset = 'this_month' | 'last_30' | 'last_90' | 'custom'
const activePreset = ref<Preset>('this_month')
const customFrom = ref('')
const customTo = ref('')

function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function applyPreset(preset: Preset): void {
  activePreset.value = preset
  if (preset === 'this_month') {
    emit('change-query', {})
    return
  }
  if (preset === 'custom') return

  const days = preset === 'last_30' ? 29 : 89
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  const granularity: AnalyticsGranularity = preset === 'last_90' ? 'week' : 'day'
  emit('change-query', { from: toLocalISODate(from), to: toLocalISODate(to), granularity })
}

function applyCustom(): void {
  if (!customFrom.value || !customTo.value) return
  emit('change-query', { from: customFrom.value, to: customTo.value, granularity: 'day' })
}

const currency = computed(() => props.data?.restaurant.currency ?? 'EUR')

const originSegments = computed(() => {
  if (!props.data) return []
  const { customer_qr, waiter, manager, cashier } = props.data.orders.by_origin
  return [
    { key: 'customer_qr', label: t('analytics.orders.customerQr'), value: customer_qr, displayValue: formatNumber(customer_qr, locale.value), color: 'var(--chart-accent)' },
    { key: 'waiter', label: t('analytics.orders.waiter'), value: waiter, displayValue: formatNumber(waiter, locale.value), color: 'var(--chart-neutral-mid)' },
    { key: 'manager', label: t('analytics.orders.manager'), value: manager, displayValue: formatNumber(manager, locale.value), color: 'var(--chart-neutral-low)' },
    { key: 'cashier', label: t('analytics.orders.cashier'), value: cashier, displayValue: formatNumber(cashier, locale.value), color: 'var(--chart-neutral-low)' },
  ]
})

const topProductsItems = computed(() => {
  if (!props.data) return []
  return props.data.products.top_by_revenue.slice(0, 8).map((product, index) => ({
    key: product.id !== null ? String(product.id) : `${product.name}-${index}`,
    label: product.name,
    value: Number(product.revenue),
    displayValue: formatMoney(product.revenue, locale.value, currency.value),
  }))
})

const staffItems = computed(() => {
  if (!props.data) return []
  return props.data.staff
    .slice()
    .sort((a, b) => b.orders_served - a.orders_served)
    .map((member) => ({
      key: String(member.user.id),
      label: member.user.name ?? t('operations.staff.unnamed'),
      value: member.orders_served,
      displayValue: t('analytics.staff.ordersServed', { count: member.orders_served }),
    }))
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Period presets — always convert to the backend's own date/granularity contract, never reproduce its default-range logic -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="preset in (['this_month', 'last_30', 'last_90', 'custom'] as Preset[])"
        :key="preset"
        type="button"
        class="rounded-full px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out"
        :class="activePreset === preset ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'"
        @click="applyPreset(preset)"
      >
        {{ t(`analytics.presets.${preset}`) }}
      </button>
      <template v-if="activePreset === 'custom'">
        <input v-model="customFrom" type="date" class="rounded-md border border-outline bg-surface-container-lowest px-2 py-1.5 text-body-md text-on-surface" />
        <input v-model="customTo" type="date" class="rounded-md border border-outline bg-surface-container-lowest px-2 py-1.5 text-body-md text-on-surface" />
        <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-label-lg font-medium text-on-primary" @click="applyCustom">
          {{ t('analytics.presets.apply') }}
        </button>
      </template>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24">
      <AProgress />
    </div>

    <ASurface
      v-else-if="error"
      tone="container"
      radius="lg"
      role="alert"
      class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">
        {{
          error.kind === 'forbidden'
            ? t('analytics.errors.forbidden')
            : error.kind === 'not_found'
              ? t('analytics.errors.notFound')
              : error.kind === 'network'
                ? t('analytics.errors.network')
                : t('analytics.errors.generic')
        }}
      </p>
    </ASurface>

    <template v-else-if="data">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard :icon="PhWallet" :label="t('analytics.summary.revenue')" :value="formatMoney(data.summary.revenue, locale, currency)" size="display" />
        <MetricCard :icon="PhForkKnife" :label="t('analytics.summary.averageTicket')" :value="formatMoney(data.summary.average_ticket, locale, currency)" />
        <MetricCard :icon="PhTable" :label="t('analytics.summary.occupancy')" :value="`${Math.round(data.occupancy.occupancy_rate * 100)}%`">
          <ProgressRing :value="data.occupancy.occupancy_rate" :label="t('analytics.summary.occupancy')" :center-text="`${Math.round(data.occupancy.occupancy_rate * 100)}%`" :size="44" />
        </MetricCard>
        <MetricCard :icon="PhClock" :label="t('analytics.summary.tableTurnover')" :value="data.table_turnover.turnover_per_table.toFixed(1) + 'x'" />
      </div>

      <SectionCard :icon="PhWallet" :title="t('analytics.charts.revenueTitle')">
        <RevenueChart :points="data.revenue_series" :currency="currency" />
      </SectionCard>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard :icon="PhChartPieSlice" :title="t('analytics.charts.peakHoursTitle')">
          <PeakHoursChart :hours="data.peak_hours" />
        </SectionCard>
        <SectionCard :icon="PhChartPieSlice" :title="t('analytics.orders.title')">
          <DonutChart :segments="originSegments" :center-value="formatNumber(data.orders.total, locale)" :center-label="t('analytics.orders.title')" :empty-message="t('analytics.charts.ordersEmpty')" />
        </SectionCard>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard :icon="PhTrophy" :title="t('analytics.products.title')">
          <BarList :items="topProductsItems" :empty-message="t('analytics.products.empty')" />
        </SectionCard>
        <SectionCard :icon="PhTrophy" :title="t('analytics.staff.title')">
          <BarList :items="staffItems" :empty-message="t('analytics.staff.empty')" />
        </SectionCard>
      </div>

      <SectionCard :icon="PhCookingPot" :title="t('analytics.kitchen.title')" class="max-w-xl">
        <dl class="flex flex-col gap-2 text-body-md">
          <div class="flex items-center justify-between">
            <dt class="text-on-surface-variant">{{ t('analytics.kitchen.averagePrep') }}</dt>
            <dd class="font-medium text-on-surface">
              {{ data.kitchen.average_preparation_time_seconds !== null ? formatDuration(data.kitchen.average_preparation_time_seconds) : t('analytics.kitchen.noData') }}
            </dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-on-surface-variant">{{ t('analytics.kitchen.ordersReady') }}</dt>
            <dd class="font-medium text-on-surface">{{ formatNumber(data.kitchen.orders_ready, locale) }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-on-surface-variant">{{ t('analytics.kitchen.ordersCancelled') }}</dt>
            <dd class="font-medium text-on-surface">{{ formatNumber(data.kitchen.orders_cancelled, locale) }}</dd>
          </div>
        </dl>
      </SectionCard>
    </template>
  </div>
</template>
