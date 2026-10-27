<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'

import BarList from '@/components/dashboard/BarList.vue'
import DonutChart from '@/components/dashboard/DonutChart.vue'
import AStatStrip from '@/components/dashboard/AStatStrip.vue'
import PeakHoursChart from '@/components/dashboard/analytics/PeakHoursChart.vue'
import RevenueChart from '@/components/dashboard/analytics/RevenueChart.vue'
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

const statItems = computed(() => {
  if (!props.data) return []
  return [
    { id: 'revenue', label: t('analytics.summary.revenue'), value: formatMoney(props.data.summary.revenue, locale.value, currency.value) },
    { id: 'average-ticket', label: t('analytics.summary.averageTicket'), value: formatMoney(props.data.summary.average_ticket, locale.value, currency.value) },
    { id: 'occupancy', label: t('analytics.summary.occupancy'), value: `${Math.round(props.data.occupancy.occupancy_rate * 100)}%` },
    { id: 'turnover', label: t('analytics.summary.tableTurnover'), value: `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(props.data.table_turnover.turnover_per_table)}×` },
  ]
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-8">
    <!-- Period presets — always convert to the backend's own date/granularity contract, never reproduce its default-range logic -->
    <div class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('analytics.presets.label')">
      <button
        v-for="preset in (['this_month', 'last_30', 'last_90', 'custom'] as Preset[])"
        :key="preset"
        type="button"
        class="min-h-11 rounded-md px-3 text-label-lg font-medium transition-colors duration-fast"
        :class="activePreset === preset ? 'bg-primary-subtle text-accent' : 'bg-surface-subtle text-fg-muted hover:bg-surface-elevated'"
        :aria-pressed="activePreset === preset"
        @click="applyPreset(preset)"
      >
        <PhCheck v-if="activePreset === preset" :size="16" aria-hidden="true" class="mr-1 inline-block align-[-2px]" />
        {{ t(`analytics.presets.${preset}`) }}
      </button>
      <template v-if="activePreset === 'custom'">
        <label class="sr-only" for="analytics-from">{{ t('analytics.presets.from') }}</label>
        <input id="analytics-from" v-model="customFrom" type="date" class="min-h-11 min-w-0 rounded-md border border-control bg-surface px-2 text-body-md text-fg" />
        <label class="sr-only" for="analytics-to">{{ t('analytics.presets.to') }}</label>
        <input id="analytics-to" v-model="customTo" type="date" class="min-h-11 min-w-0 rounded-md border border-control bg-surface px-2 text-body-md text-fg" />
        <button type="button" class="min-h-11 rounded-md bg-primary px-3 text-label-lg font-medium text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" @click="applyCustom">
          {{ t('analytics.presets.apply') }}
        </button>
      </template>
    </div>

    <div v-if="loading && !data" class="flex flex-col gap-6" aria-busy="true" role="status">
      <span class="sr-only">{{ t('analytics.loading') }}</span>
      <div class="h-24 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      <div class="h-64 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
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
      <p v-if="loading" class="text-label-md text-fg-muted" role="status">{{ t('analytics.loading') }}</p>
      <AStatStrip :items="statItems" />

      <section class="min-w-0 border-t border-hairline pt-5" aria-labelledby="analytics-revenue-title">
        <h2 id="analytics-revenue-title" class="mb-4 text-section-title font-semibold text-fg">{{ t('analytics.charts.revenueTitle') }}</h2>
        <RevenueChart :points="data.revenue_series" :currency="currency" />
      </section>

      <div class="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
        <section class="min-w-0 border-t border-hairline pt-5" aria-labelledby="analytics-peak-title">
          <h2 id="analytics-peak-title" class="mb-4 text-component-title font-semibold text-fg">{{ t('analytics.charts.peakHoursTitle') }}</h2>
          <PeakHoursChart :hours="data.peak_hours" />
        </section>
        <section class="min-w-0 border-t border-hairline pt-5" aria-labelledby="analytics-origins-title">
          <h2 id="analytics-origins-title" class="mb-4 text-component-title font-semibold text-fg">{{ t('analytics.orders.title') }}</h2>
          <DonutChart :segments="originSegments" :center-value="formatNumber(data.orders.total, locale)" :center-label="t('analytics.orders.title')" :empty-message="t('analytics.charts.ordersEmpty')" />
        </section>
      </div>

      <div class="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
        <section class="min-w-0 border-t border-hairline pt-5" aria-labelledby="analytics-products-title">
          <h2 id="analytics-products-title" class="mb-4 text-component-title font-semibold text-fg">{{ t('analytics.products.title') }}</h2>
          <BarList :items="topProductsItems" :empty-message="t('analytics.products.empty')" />
        </section>
        <section class="min-w-0 border-t border-hairline pt-5" aria-labelledby="analytics-staff-title">
          <h2 id="analytics-staff-title" class="mb-4 text-component-title font-semibold text-fg">{{ t('analytics.staff.title') }}</h2>
          <BarList :items="staffItems" :empty-message="t('analytics.staff.empty')" />
        </section>
      </div>

      <section class="max-w-xl border-t border-hairline pt-5" aria-labelledby="analytics-kitchen-title">
        <h2 id="analytics-kitchen-title" class="mb-4 text-component-title font-semibold text-fg">{{ t('analytics.kitchen.title') }}</h2>
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
      </section>
    </template>
  </div>
</template>
