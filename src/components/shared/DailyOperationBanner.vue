<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { PhCalendarCheck, PhCalendarX } from '@phosphor-icons/vue'

import type { OperationsDailyOperation } from '@/types/daily-operation'
import { formatDateOnly } from '@/utils/format'

/**
 * Operational-day status for operational screens, read from the
 * operations/live snapshot those screens already keep fresh through their
 * realtime/fallback cycle — no request of its own, no financial data.
 * Shown as text + icon, never colour alone.
 */
defineProps<{
  dailyOperation: OperationsDailyOperation
  /** open_daily_operation or close_daily_operation — links to the day screen. */
  canManage: boolean
}>()

const { t, locale } = useI18n()
</script>

<template>
  <div
    v-if="dailyOperation.status === 'not_open'"
    role="status"
    class="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-container p-4 text-on-warning-container sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="flex items-start gap-3">
      <PhCalendarX :size="22" aria-hidden="true" class="mt-0.5 shrink-0" />
      <div>
        <p class="text-body-lg font-semibold">{{ t('dailyOperation.notOpen') }}</p>
        <p class="text-body-md">{{ t('dailyOperation.notOpenStaff') }}</p>
      </div>
    </div>
    <RouterLink
      v-if="canManage"
      :to="{ name: 'app-day-close' }"
      class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-label-lg font-medium text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('dailyOperation.goToOpen') }}
    </RouterLink>
  </div>
  <p v-else role="status" class="flex items-center gap-2 text-body-md text-on-surface-variant">
    <PhCalendarCheck :size="18" aria-hidden="true" class="shrink-0 text-primary" />
    {{ t('dailyOperation.openState', { date: formatDateOnly(dailyOperation.business_date, locale) }) }}
  </p>
</template>
