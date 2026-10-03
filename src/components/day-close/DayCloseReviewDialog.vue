<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import type { ApiError } from '@/api/errors'
import type { DayClosePreview } from '@/types/day-close'
import { describeApiError } from '@/utils/error-message'
import { formatDateOnly, formatMoney } from '@/utils/format'

/** CARTA 9.1B §24/§25 — a compact, final summary before the real POST fires; every number shown here is read straight from `preview`/the form, never a new computation. */
const props = defineProps<{
  preview: DayClosePreview
  currency: string
  countedCash: string
  submitting: boolean
  error: ApiError | null
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t, locale } = useI18n()

function money(amount: string): string {
  return formatMoney(amount, locale.value, props.currency)
}

function difference(): number | null {
  if (props.preview.cash.expected_cash === null) return null
  const counted = Number(props.countedCash)
  if (Number.isNaN(counted)) return null
  return Math.round((counted - Number(props.preview.cash.expected_cash)) * 100) / 100
}
</script>

<template>
  <ABottomSheet :label="t('dayClose.review.dialogTitle')" @close="emit('cancel')">
    <dl class="flex flex-col divide-y divide-outline-variant text-body-md">
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.businessDate') }}</dt>
        <dd class="font-medium text-on-surface">{{ formatDateOnly(preview.period.business_date, locale) }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.totalReceived') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ money(preview.financial.total_received) }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.expectedCash') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ preview.cash.expected_cash !== null ? money(preview.cash.expected_cash) : '—' }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.countedCash') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ money(countedCash || '0') }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.difference') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ difference() !== null ? money(Math.abs(difference()!).toFixed(2)) : '—' }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.orders') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ preview.operations.orders.valid }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.criticalFeedback') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ preview.feedback.critical_count }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.delays') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ preview.delays.total_count }}</dd>
      </div>
      <div class="flex justify-between gap-3 py-2">
        <dt class="text-on-surface-variant">{{ t('dayClose.review.unavailableProducts') }}</dt>
        <dd class="font-medium tabular-nums text-on-surface">{{ preview.product_availability.count }}</dd>
      </div>
    </dl>

    <p v-if="error" class="mt-3 text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>

    <template #footer>
      <div class="flex gap-3">
        <AButton variant="outlined" class="flex-1" :disabled="submitting" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
        <AButton class="flex-1" :loading="submitting" @click="emit('confirm')">{{ t('dayClose.review.confirm') }}</AButton>
      </div>
    </template>
  </ABottomSheet>
</template>
