<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarningCircle } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import type { DayCloseBlocker, DayClosePeriod } from '@/types/day-close'

/**
 * CARTA 9.1B §7/§8/§9 — period context + readiness/blockers in one block
 * ("Estado de la operación"). Never shows raw backend codes/timestamps —
 * every blocker gets a human sentence built from its own real fields.
 * `can_be_voided` is the ONLY in-place action offered here (§9/§10 — never
 * an automatic close/cancel/void).
 */
const props = defineProps<{
  period: DayClosePeriod
  canClose: boolean
  blockers: DayCloseBlocker[]
}>()
defineEmits<{ void: [number] }>()

const { t, locale } = useI18n()

function dateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(year, month - 1, day))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
  }
}

function dateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: props.period.timezone }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: props.period.timezone }).format(new Date(value))
  }
}

const periodTitle = computed(() =>
  props.period.covers_multiple_business_days
    ? t('dayClose.period.rangeTitle')
    : t('dayClose.period.title', { date: dateOnly(props.period.business_date) }),
)

const periodRange = computed(() => t('dayClose.period.range', { from: dateTime(props.period.period_started_at), to: dateTime(props.period.period_ended_at) }))

function isActiveSession(blocker: DayCloseBlocker): blocker is Extract<DayCloseBlocker, { type: 'active_session' }> {
  return blocker.type === 'active_session'
}
</script>

<template>
  <SectionCard :icon="canClose ? PhCheckCircle : PhWarningCircle" :title="t('dayClose.status.title')">
    <div>
      <p class="text-title-md font-semibold text-on-surface">{{ periodTitle }}</p>
      <p v-if="period.covers_multiple_business_days" class="text-body-md text-on-surface-variant">{{ periodRange }}</p>
      <p v-if="period.covers_multiple_business_days" class="mt-1 text-label-md text-on-surface-variant">{{ t('dayClose.period.multiDayNotice') }}</p>
      <p v-if="period.first_close" class="mt-1 text-label-md text-on-surface-variant">{{ t('dayClose.period.firstClose') }}</p>
    </div>

    <div class="mt-4 flex items-center gap-2 rounded-lg p-3" :class="canClose ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container'">
      <component :is="canClose ? PhCheckCircle : PhWarningCircle" :size="20" aria-hidden="true" class="shrink-0" />
      <p class="text-body-lg font-medium">{{ canClose ? t('dayClose.status.ready') : t('dayClose.status.notReady') }}</p>
    </div>

    <div v-if="blockers.length > 0" class="mt-4">
      <p class="mb-2 text-label-lg font-medium text-on-surface">{{ t('dayClose.status.blockersIntro') }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="(blocker, index) in blockers" :key="index" class="rounded-lg border border-outline-variant p-3">
          <template v-if="isActiveSession(blocker)">
            <p class="text-body-md font-medium text-on-surface">
              {{ t('dayClose.status.blockerActiveSession', { table: blocker.table.name, openedAt: dateTime(blocker.opened_at) }) }}
            </p>
            <p v-if="Number(blocker.balance) > 0" class="text-label-md text-on-surface-variant">
              {{ t('dayClose.status.blockerBalance', { balance: blocker.balance }) }}
            </p>
            <p v-if="blocker.open_orders_count > 0" class="text-label-md text-on-surface-variant">
              {{ t('dayClose.status.blockerOpenOrders', blocker.open_orders_count) }}
            </p>
            <AButton v-if="blocker.can_be_voided" variant="outlined" class="mt-2" @click="$emit('void', blocker.table_session_id)">
              {{ t('dayClose.status.voidAction') }}
            </AButton>
          </template>
          <p v-else-if="blocker.type === 'business_date_already_closed'" class="text-body-md font-medium text-on-surface">
            {{ t('dayClose.status.blockerBusinessDateAlreadyClosed') }}
          </p>
          <p v-else class="text-body-md font-medium text-on-surface">
            {{ t('dayClose.status.blockerExpectedCashNegative') }}
          </p>
        </li>
      </ul>
    </div>
  </SectionCard>
</template>
