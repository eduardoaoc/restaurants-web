<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhForkKnife, PhTable, PhWallet } from '@phosphor-icons/vue'

import MetricCard from '@/components/dashboard/MetricCard.vue'
import { useCountUp } from '@/composables/useCountUp'
import type { OperationsSummary } from '@/types/operations'
import { formatMoney, formatNumber } from '@/utils/format'

const props = defineProps<{
  summary: OperationsSummary
  currency: string
  /** Every open alert regardless of severity — the same count the "Necesita atención" panel lists (§10/§11). */
  pendingAttentionCount: number
}>()

const { t, locale } = useI18n()

// Each counter animates from its previous displayed value to the new real
// value on every change (first paint animates 0 -> value, a later live
// refresh animates old -> new) — never a fabricated intermediate number,
// see the task's chart/counter animation rules.
const occupiedCount = useCountUp(computed(() => props.summary.tables.occupied))
const activeOrdersCount = useCountUp(computed(() => props.summary.orders.active))
const pendingCount = useCountUp(computed(() => props.pendingAttentionCount))

const occupancyPercent = computed(() => Math.round(props.summary.tables.occupancy_rate * 100))
</script>

<template>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <MetricCard
      :icon="PhTable"
      :label="t('operations.quick.occupancy')"
      :value="`${Math.round(occupiedCount)} / ${formatNumber(summary.tables.total, locale)}`"
      :context="t('operations.quick.occupancyContext', { percent: occupancyPercent })"
    />
    <MetricCard
      :icon="PhForkKnife"
      :label="t('operations.quick.activeOrders')"
      :value="formatNumber(Math.round(activeOrdersCount), locale)"
    />
    <MetricCard
      :icon="PhWallet"
      :label="t('operations.salesToday')"
      :value="formatMoney(summary.sales.received_today, locale, currency)"
    />
    <MetricCard
      :icon="PhBellRinging"
      :label="t('operations.quick.pendingAttention')"
      :value="formatNumber(Math.round(pendingCount), locale)"
      :context="pendingAttentionCount > 0 ? t('operations.quick.pendingAttentionActive') : t('operations.quick.pendingAttentionNone')"
    />
  </div>
</template>
