<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhForkKnife, PhTable, PhUsers } from '@phosphor-icons/vue'

import MetricCard from '@/components/dashboard/MetricCard.vue'
import { useCountUp } from '@/composables/useCountUp'
import type { OperationsSummary } from '@/types/operations'
import { formatNumber } from '@/utils/format'

const props = defineProps<{
  summary: OperationsSummary
  criticalAlertsCount: number
}>()

const { t, locale } = useI18n()

// Each counter animates from its previous displayed value to the new real
// value on every change (first paint animates 0 -> value, a later live
// refresh animates old -> new) — never a fabricated intermediate number,
// see the task's chart/counter animation rules.
const occupiedCount = useCountUp(computed(() => props.summary.tables.occupied))
const guestsCount = useCountUp(computed(() => props.summary.active_guests))
const activeOrdersCount = useCountUp(computed(() => props.summary.orders.active))
const criticalCount = useCountUp(computed(() => props.criticalAlertsCount))

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
      :icon="PhUsers"
      :label="t('operations.quick.guestsNow')"
      :value="formatNumber(Math.round(guestsCount), locale)"
    />
    <MetricCard
      :icon="PhForkKnife"
      :label="t('operations.quick.activeOrders')"
      :value="formatNumber(Math.round(activeOrdersCount), locale)"
    />
    <MetricCard
      :icon="PhBellRinging"
      :label="t('operations.quick.alerts')"
      :value="formatNumber(Math.round(criticalCount), locale)"
      :context="criticalAlertsCount > 0 ? t('operations.quick.alertsCritical') : t('operations.quick.alertsNone')"
    />
  </div>
</template>
