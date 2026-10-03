<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarningCircle } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import DayCloseWhatsAppBadge from '@/components/day-close/DayCloseWhatsAppBadge.vue'
import { whatsappFailureKey } from '@/utils/day-close-whatsapp'
import type { DayClose } from '@/types/day-close'
import { formatMoney } from '@/utils/format'

/**
 * CARTA 9.1B §33 — shown right after a successful close. `has_incidents` is
 * read straight off the persisted `DayClose`, never inferred from an
 * activity-feed tone (the task explicitly warns `day_close.completed`'s
 * `tone=positive` does not mean "no incidents").
 */
const props = defineProps<{ dayClose: DayClose }>()
const emit = defineEmits<{ 'view-detail': [] }>()

const { t, locale } = useI18n()

function money(amount: string): string {
  return formatMoney(amount, locale.value, props.dayClose.currency)
}

function dateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  }
}

const tone = computed(() => (props.dayClose.has_incidents ? 'warning' : 'success'))
</script>

<template>
  <SectionCard :icon="tone === 'success' ? PhCheckCircle : PhWarningCircle" :title="t('dayClose.success.title')">
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center rounded-xs px-2 py-0.5 text-label-md font-medium"
        :class="dayClose.has_incidents ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container'"
      >
        {{ dayClose.has_incidents ? t('dayClose.history.badges.withIncidents') : t('dayClose.history.badges.noIncidents') }}
      </span>
    </div>

    <dl class="mt-4 flex flex-col divide-y divide-outline-variant text-body-md">
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.success.date') }}</dt>
        <dd class="font-medium text-on-surface">{{ dateOnly(dayClose.business_date) }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.success.total') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ money(dayClose.total_received) }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.success.difference') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ money(dayClose.cash_difference) }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.success.closedBy') }}</dt>
        <dd class="font-medium text-on-surface">{{ dayClose.closed_by.name }}</dd>
      </div>
    </dl>

    <div v-if="dayClose.whatsapp" class="mt-4 text-body-md text-on-surface-variant">
      <span>{{ t('dayClose.whatsapp.title') }}: </span>
      <DayCloseWhatsAppBadge :status="dayClose.whatsapp.status" />
      <p v-if="whatsappFailureKey(dayClose.whatsapp.status, dayClose.whatsapp.failure_code)" class="mt-1">{{ t(whatsappFailureKey(dayClose.whatsapp.status, dayClose.whatsapp.failure_code)!) }}</p>
    </div>
    <AButton class="mt-5 w-full" @click="emit('view-detail')">{{ t('dayClose.success.viewClose') }}</AButton>
  </SectionCard>
</template>
