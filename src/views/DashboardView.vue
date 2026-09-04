<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhBellRinging,
  PhCalendarBlank,
  PhChartPieSlice,
  PhCreditCard,
  PhReceipt,
  PhTable,
  PhTrophy,
  PhWallet,
} from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import BarList from '@/components/dashboard/BarList.vue'
import DonutChart from '@/components/dashboard/DonutChart.vue'
import MetricCard from '@/components/dashboard/MetricCard.vue'
import ProgressRing from '@/components/dashboard/ProgressRing.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import { dashboardService } from '@/services/dashboard.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { RestaurantDashboard } from '@/types/dashboard'
import { DEFAULT_CURRENCY, formatDateOnly, formatMoney, formatNumber } from '@/utils/format'

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const dashboard = ref<RestaurantDashboard | null>(null)
const loading = ref(false)
const error = ref<ApiError | null>(null)

const currency = computed(() => restaurantStore.currentSettings?.currency ?? DEFAULT_CURRENCY)

const periodLabel = computed(() => {
  if (!dashboard.value) return ''
  return t('dashboard.periodLabel', {
    from: formatDateOnly(dashboard.value.period.from, locale.value),
    to: formatDateOnly(dashboard.value.period.to, locale.value),
  })
})

// Real ratios derived from two already-fetched fields — never a fabricated
// trend/comparison (see docs/design-system.md §21 and CLAUDE.md §20).
const serviceRate = computed(() => {
  if (!dashboard.value || dashboard.value.orders.created === 0) return 0
  return dashboard.value.orders.served / dashboard.value.orders.created
})

const paymentCoverage = computed(() => {
  if (!dashboard.value || dashboard.value.tables.sessions_closed === 0) return 0
  return Math.min(dashboard.value.sales.sessions_with_payments / dashboard.value.tables.sessions_closed, 1)
})

const ordersOriginSegments = computed(() => {
  if (!dashboard.value) return []
  const { customer_qr, staff_created } = dashboard.value.orders
  return [
    {
      key: 'customer_qr',
      label: t('dashboard.orders.customerQr'),
      value: customer_qr,
      displayValue: formatNumber(customer_qr, locale.value),
      color: 'var(--chart-accent)',
    },
    {
      key: 'staff_created',
      label: t('dashboard.orders.staffCreated'),
      value: staff_created,
      displayValue: formatNumber(staff_created, locale.value),
      color: 'var(--chart-neutral-mid)',
    },
  ]
})

const PAYMENT_METHOD_COLOR: Record<string, string> = {
  cash: 'var(--chart-accent)',
  card: 'var(--chart-neutral-mid)',
  other: 'var(--chart-neutral-low)',
}
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'dashboard.payments.methods.cash',
  card: 'dashboard.payments.methods.card',
  other: 'dashboard.payments.methods.other',
}

const paymentSegments = computed(() => {
  if (!dashboard.value) return []
  return Object.entries(dashboard.value.payments.by_method).map(([method, stats]) => ({
    key: method,
    label: t(PAYMENT_METHOD_LABEL[method] ?? method),
    value: Number(stats.amount),
    displayValue: formatMoney(stats.amount, locale.value, currency.value),
    color: PAYMENT_METHOD_COLOR[method] ?? 'var(--chart-neutral-low)',
  }))
})

const staffBarItems = computed(() => {
  if (!dashboard.value) return []
  return dashboard.value.staff.top_by_orders_served.map((entry) => ({
    key: String(entry.staff.id),
    label: entry.staff.name,
    value: entry.orders_served,
    displayValue: t('dashboard.staff.ordersServed', { count: entry.orders_served }),
  }))
})

const tablesBarItems = computed(() => {
  if (!dashboard.value) return []
  const { sessions_opened, sessions_closed, current_active } = dashboard.value.tables
  return [
    {
      key: 'opened',
      label: t('dashboard.tables.sessionsOpened'),
      value: sessions_opened,
      displayValue: formatNumber(sessions_opened, locale.value),
    },
    {
      key: 'closed',
      label: t('dashboard.tables.sessionsClosed'),
      value: sessions_closed,
      displayValue: formatNumber(sessions_closed, locale.value),
    },
    {
      key: 'active',
      label: t('dashboard.tables.currentActive'),
      value: current_active,
      displayValue: formatNumber(current_active, locale.value),
    },
  ]
})

async function fetchDashboard(restaurantId: number | null): Promise<void> {
  dashboard.value = null
  error.value = null

  if (restaurantId === null) return

  loading.value = true
  try {
    dashboard.value = await dashboardService.get(restaurantId)
  } catch (err) {
    error.value = normalizeApiError(err)
  } finally {
    loading.value = false
  }
}

watch(() => restaurantStore.currentRestaurantId, fetchDashboard, { immediate: true })
</script>

<template>
  <div>
    <!-- Restaurant context still loading (App Shell just mounted) -->
    <div v-if="restaurantStore.loading" class="flex items-center justify-center py-24">
      <AProgress />
    </div>

    <!-- Restaurant list failed to load (e.g. no organization, network) -->
    <ASurface
      v-else-if="restaurantStore.error"
      tone="container"
      radius="lg"
      role="alert"
      class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">{{ t('dashboard.errors.generic') }}</p>
      <p class="mt-1 text-body-md">{{ restaurantStore.error.message ?? t('dashboard.errors.generic') }}</p>
    </ASurface>

    <!-- Authenticated, but no accessible restaurant at all -->
    <ASurface
      v-else-if="restaurantStore.restaurants.length === 0"
      tone="container"
      radius="lg"
      class="max-w-xl p-6"
    >
      <p class="text-title-md font-medium text-on-surface">{{ t('dashboard.noRestaurantAccess') }}</p>
    </ASurface>

    <!-- Dashboard data loading for the current restaurant -->
    <div v-else-if="loading" class="flex items-center justify-center py-24">
      <AProgress />
    </div>

    <!-- Dashboard fetch failed -->
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
            ? t('dashboard.errors.forbidden')
            : error.kind === 'not_found'
              ? t('dashboard.errors.notFound')
              : error.kind === 'network'
                ? t('dashboard.errors.network')
                : t('dashboard.errors.generic')
        }}
      </p>
    </ASurface>

    <div v-else-if="dashboard" class="flex flex-col gap-6">
      <span
        class="inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-outline-variant bg-surface-container-high px-3 py-1 text-label-lg text-on-surface-variant"
      >
        <PhCalendarBlank :size="14" />
        {{ periodLabel }}
      </span>

      <!-- Primary KPIs: the numbers a manager checks first -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          :icon="PhWallet"
          :label="t('dashboard.sales.total')"
          :value="formatMoney(dashboard.sales.total, locale, currency)"
          :context="periodLabel"
          size="display"
        />
        <MetricCard
          :icon="PhReceipt"
          :label="t('dashboard.sales.averageTicket')"
          :value="formatMoney(dashboard.sales.average_ticket, locale, currency)"
        />
        <MetricCard
          :icon="PhTable"
          :label="t('dashboard.sales.sessionsWithPayments')"
          :value="formatNumber(dashboard.sales.sessions_with_payments, locale)"
        >
          <ProgressRing
            v-if="dashboard.tables.sessions_closed > 0"
            :value="paymentCoverage"
            :label="t('dashboard.sales.sessionsWithPayments')"
            :center-text="`${Math.round(paymentCoverage * 100)}%`"
            :size="48"
          />
        </MetricCard>
      </div>

      <!-- Real distributions: payment methods (by amount) / order origin -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard :icon="PhCreditCard" :title="t('dashboard.payments.title')">
          <p class="mb-3 text-label-md text-on-surface-variant">
            {{ t('dashboard.payments.totalRecords') }}: {{ formatNumber(dashboard.payments.total_records, locale) }}
          </p>
          <DonutChart
            :segments="paymentSegments"
            :center-value="formatMoney(dashboard.sales.total, locale, currency)"
            :center-label="t('dashboard.payments.title')"
            :empty-message="t('dashboard.charts.paymentsEmpty')"
          />
        </SectionCard>

        <SectionCard :icon="PhChartPieSlice" :title="t('dashboard.orders.title')">
          <div class="mb-3 flex items-center justify-between gap-3">
            <p class="text-label-md text-on-surface-variant">
              {{ t('dashboard.orders.cancelled') }}: {{ formatNumber(dashboard.orders.cancelled, locale) }}
            </p>
            <span v-if="dashboard.orders.created > 0" class="flex items-center gap-1.5 text-label-md text-on-surface-variant">
              {{ t('dashboard.orders.serviceRate') }}
              <ProgressRing
                :value="serviceRate"
                :label="t('dashboard.orders.serviceRate')"
                :center-text="`${Math.round(serviceRate * 100)}%`"
                :size="36"
              />
            </span>
          </div>
          <DonutChart
            :segments="ordersOriginSegments"
            :center-value="formatNumber(dashboard.orders.created, locale)"
            :center-label="t('dashboard.orders.created')"
            :empty-message="t('dashboard.charts.ordersEmpty')"
          />
        </SectionCard>
      </div>

      <!-- Magnitude comparisons: staff ranking / tables activity -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard :icon="PhTrophy" :title="t('dashboard.staff.title')">
          <BarList :items="staffBarItems" :empty-message="t('dashboard.staff.empty')" />
        </SectionCard>

        <SectionCard :icon="PhTable" :title="t('dashboard.tables.title')">
          <BarList :items="tablesBarItems" :empty-message="t('dashboard.charts.tablesEmpty')" />
        </SectionCard>
      </div>

      <!-- Operational details: small counters, no chart needed -->
      <SectionCard :icon="PhBellRinging" :title="t('dashboard.requests.title')" class="max-w-xl">
        <dl class="flex flex-col gap-2 text-body-md">
          <div class="flex items-center justify-between">
            <dt class="text-on-surface-variant">{{ t('dashboard.requests.callWaiter') }}</dt>
            <dd class="font-medium text-on-surface">{{ formatNumber(dashboard.requests.call_waiter, locale) }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-on-surface-variant">{{ t('dashboard.requests.requestBill') }}</dt>
            <dd class="font-medium text-on-surface">{{ formatNumber(dashboard.requests.request_bill, locale) }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-on-surface-variant">{{ t('dashboard.requests.completed') }}</dt>
            <dd class="font-medium text-on-surface">{{ formatNumber(dashboard.requests.completed, locale) }}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  </div>
</template>
