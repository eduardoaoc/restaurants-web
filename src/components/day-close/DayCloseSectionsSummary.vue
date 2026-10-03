<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhCheckCircle, PhForkKnife, PhPackage, PhReceipt, PhStar, PhTimer, PhUsersThree, PhWarningCircle,
} from '@phosphor-icons/vue'

import BarList from '@/components/dashboard/BarList.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import MetricCard from '@/components/dashboard/MetricCard.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import type { DayCloseSections } from '@/types/day-close'
import { formatDuration, formatMoney, formatNumber } from '@/utils/format'

/**
 * CARTA 9.1B §6/§19/§20/§22/§38 — renders the ONE shared `DayCloseSections`
 * shape (financial/operations/products/product_availability/feedback/
 * delays) that both the live `GET .../day-close/preview` and a persisted
 * close's own immutable `report` return — identical contract, so this is
 * the single place either one is rendered (never two parallel
 * implementations, never recomputed for a past close — §37/§38).
 */
const props = defineProps<{
  sections: DayCloseSections
  currency: string
  timezone: string
}>()

const { t, locale } = useI18n()

function money(amount: string): string {
  return formatMoney(amount, locale.value, props.currency)
}

function dateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: props.timezone }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: props.timezone }).format(new Date(value))
  }
}

function timeOnly(value: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { timeStyle: 'short', timeZone: props.timezone }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { timeStyle: 'short', timeZone: props.timezone }).format(new Date(value))
  }
}

const topProductItems = computed(() =>
  props.sections.products.top.map((product, index) => ({
    key: product.product_id !== null ? String(product.product_id) : `unknown-${index}`,
    label: product.name,
    value: product.quantity,
    displayValue: formatNumber(product.quantity, locale.value),
  })),
)

const topProduct = computed(() => props.sections.products.top[0] ?? null)

const peakHourLabel = computed(() => {
  const peak = props.sections.operations.peak_hour
  if (!peak) return null
  return t('dayClose.financial.peakHour', { hour: timeOnly(`${peak.local_hour}:00`), count: peak.sessions_started })
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Financiero + Operación -->
    <SectionCard :icon="PhReceipt" :title="t('dayClose.financial.title')">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard :icon="PhReceipt" :label="t('dayClose.financial.totalReceived')" :value="money(sections.financial.total_received)" />
        <MetricCard :icon="PhReceipt" :label="t('dayClose.financial.cash')" :value="money(sections.financial.by_method.cash)" />
        <MetricCard :icon="PhReceipt" :label="t('dayClose.financial.card')" :value="money(sections.financial.by_method.card)" />
        <MetricCard :icon="PhReceipt" :label="t('dayClose.financial.other')" :value="money(sections.financial.by_method.other)" />
        <MetricCard :icon="PhReceipt" :label="t('dayClose.financial.averageTicket')" :value="money(sections.financial.average_ticket)" />
        <MetricCard :icon="PhForkKnife" :label="t('dayClose.financial.orders')" :value="formatNumber(sections.operations.orders.valid, locale)" />
        <MetricCard :icon="PhUsersThree" :label="t('dayClose.financial.sessions')" :value="formatNumber(sections.operations.sessions.closed, locale)" />
        <MetricCard :icon="PhUsersThree" :label="t('dayClose.financial.guests')" :value="formatNumber(sections.operations.guests, locale)" />
      </div>
      <p v-if="peakHourLabel" class="mt-3 text-label-md text-on-surface-variant">{{ peakHourLabel }}</p>
    </SectionCard>

    <!-- Top products -->
    <SectionCard :icon="PhForkKnife" :title="t('dayClose.financial.topProductsList')">
      <p v-if="topProduct" class="mb-2 text-body-md text-on-surface-variant">
        {{ t('dayClose.financial.topProducts') }}: <span class="font-medium text-on-surface">{{ topProduct.name }}</span>
      </p>
      <BarList :items="topProductItems" :empty-message="t('dayClose.financial.noTopProducts')" />
    </SectionCard>

    <!-- Productos no disponibles -->
    <SectionCard v-if="sections.product_availability.count > 0" :icon="PhPackage" :title="t('dayClose.products.unavailableTitle')">
      <ul class="flex flex-col gap-3">
        <li v-for="item in sections.product_availability.items" :key="item.restaurant_product_id" class="border-b border-outline-variant pb-3 last:border-0 last:pb-0">
          <p class="text-body-md font-medium text-on-surface">{{ item.product_name_snapshot ?? '—' }}</p>
          <p class="text-label-md text-on-surface-variant">
            {{ item.unavailable_since_known && item.unavailable_at ? t('dayClose.products.unavailableSince', { time: dateTime(item.unavailable_at) }) : t('dayClose.products.unavailableSinceUnknown') }}
            <span v-if="item.unavailable_by_name"> · {{ t('dayClose.products.markedBy', { name: item.unavailable_by_name }) }}</span>
          </p>
          <p class="text-label-md text-on-surface-variant">
            <template v-if="item.available_again_at">{{ t('dayClose.products.availableAgain', { time: dateTime(item.available_again_at) }) }}</template>
            <template v-else>{{ t('dayClose.products.stillUnavailable') }}</template>
            <span v-if="item.duration_seconds !== null"> · {{ t('dayClose.products.duration', { duration: formatDuration(item.duration_seconds) }) }}</span>
          </p>
        </li>
      </ul>
    </SectionCard>

    <!-- Feedback -->
    <SectionCard :icon="PhStar" :title="t('dayClose.feedback.title')">
      <div class="grid grid-cols-3 gap-3">
        <MetricCard :icon="PhStar" :label="t('dayClose.feedback.count')" :value="formatNumber(sections.feedback.count, locale)" />
        <MetricCard :icon="PhStar" :label="t('dayClose.feedback.average')" :value="sections.feedback.avg_overall ?? '—'" />
        <MetricCard :icon="PhWarningCircle" :label="t('dayClose.feedback.critical')" :value="formatNumber(sections.feedback.critical_count, locale)" />
      </div>

      <template v-if="sections.feedback.count > 0">
        <div v-if="sections.feedback.critical.length > 0" class="mt-4">
          <p class="mb-2 text-label-lg font-semibold text-on-surface">{{ t('dayClose.feedback.criticalTitle') }}</p>
          <ul class="flex flex-col gap-2">
            <li v-for="item in sections.feedback.critical" :key="item.feedback_id" class="rounded-lg bg-critical-container p-3 text-on-critical-container">
              <p class="text-label-md">
                {{ timeOnly(item.submitted_at) }} · {{ item.table ? t('dayClose.feedback.table', { name: item.table.name }) : '—' }}
              </p>
              <p class="mt-1 text-body-md font-medium">
                {{ t('dayClose.feedback.ratings', { overall: item.ratings.overall, food: item.ratings.food, service: item.ratings.service, wait: item.ratings.wait_time }) }}
              </p>
              <p v-if="item.experience_comment" class="mt-1 text-body-md">{{ item.experience_comment }}</p>
              <p v-if="item.improvement_comment" class="mt-1 text-body-md">{{ item.improvement_comment }}</p>
              <p v-if="item.waiter_name" class="mt-1 text-label-md opacity-80">{{ t('dayClose.feedback.waiter', { name: item.waiter_name }) }}</p>
            </li>
          </ul>
        </div>
        <EmptyState v-else :icon="PhCheckCircle" :message="t('dayClose.feedback.noCritical')" />

        <div v-if="sections.feedback.low_dimension_count > 0" class="mt-4">
          <p class="mb-2 text-label-lg font-semibold text-on-surface">{{ t('dayClose.feedback.attentionTitle') }}</p>
          <ul class="flex flex-col gap-2">
            <li v-for="item in sections.feedback.attention" :key="item.feedback_id" class="rounded-lg bg-warning-container p-3 text-on-warning-container">
              <p class="text-label-md">
                {{ timeOnly(item.submitted_at) }} · {{ item.table ? t('dayClose.feedback.table', { name: item.table.name }) : '—' }}
              </p>
              <p class="mt-1 text-body-md font-medium">
                {{ t('dayClose.feedback.ratings', { overall: item.ratings.overall, food: item.ratings.food, service: item.ratings.service, wait: item.ratings.wait_time }) }}
              </p>
              <p v-if="item.experience_comment" class="mt-1 text-body-md">{{ item.experience_comment }}</p>
              <p v-if="item.improvement_comment" class="mt-1 text-body-md">{{ item.improvement_comment }}</p>
            </li>
          </ul>
        </div>
      </template>
      <EmptyState v-else :icon="PhStar" :message="t('dayClose.feedback.empty')" />
    </SectionCard>

    <!-- Demoras -->
    <SectionCard :icon="PhTimer" :title="t('dayClose.delays.title')">
      <p class="mb-3 text-body-md font-medium text-on-surface">{{ t('dayClose.delays.summary', { count: sections.delays.total_count }) }}</p>
      <EmptyState v-if="sections.delays.items.length === 0" :icon="PhTimer" :message="t('dayClose.delays.empty')" />
      <ul v-else class="flex flex-col gap-2">
        <li v-for="item in sections.delays.items" :key="`${item.order_id}-${item.stage}`" class="border-b border-outline-variant pb-2 last:border-0 last:pb-0">
          <p class="text-body-md font-medium text-on-surface">{{ item.order_reference }} · {{ item.table?.name ?? '—' }} · {{ t(`dayClose.delays.stage.${item.stage}`) }}</p>
          <p class="text-label-md text-on-surface-variant">
            {{ t('dayClose.delays.excess', { duration: formatDuration(item.duration_seconds), threshold: formatDuration(item.threshold_seconds), excess: formatDuration(item.excess_seconds) }) }}
          </p>
          <p v-if="item.associated_action_user && item.associated_action_label" class="text-label-md text-on-surface-variant">
            {{ t(`dayClose.delays.${item.associated_action_label === 'served_by' ? 'servedBy' : 'markedReadyBy'}`, { name: item.associated_action_user.name }) }}
          </p>
        </li>
      </ul>
    </SectionCard>
  </div>
</template>
