<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowCircleDown, PhArrowCircleUp, PhCashRegister } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import ATextField from '@/components/ui/ATextField.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import type { CashMovement } from '@/types/cash-movement'
import type { DayCloseCashPreview } from '@/types/day-close'
import { formatMoney } from '@/utils/format'

/**
 * CARTA 9.1B §13-§17 — "Recuento de caja". `countedCash`/`openingFloatInput`/
 * `cashLeftForNextDay`/`cashDifferenceNote` are all owned by the parent
 * (v-model-style props+emits) since they're part of the SAME close
 * submission the parent orchestrates — this card is presentation +
 * input only, never its own source of truth for what gets submitted.
 *
 * The visual difference (`localDifference`) is computed here purely for
 * IMMEDIATE feedback while counting (§15/§16) — the backend recomputes and
 * is the sole authority on the real `cash_difference` once submitted,
 * never this client-side number.
 */
const props = defineProps<{
  cash: DayCloseCashPreview
  currency: string
  movements: CashMovement[]
  movementsLoading: boolean
  openingFloatInput: string
  countedCash: string
  cashLeftForNextDay: string
  cashDifferenceNote: string
}>()

const emit = defineEmits<{
  'update:openingFloatInput': [string]
  'update:countedCash': [string]
  'update:cashLeftForNextDay': [string]
  'update:cashDifferenceNote': [string]
  'add-movement': ['pay_in' | 'pay_out']
  'opening-float-blur': []
}>()

const { t, locale } = useI18n()

function money(amount: string): string {
  return formatMoney(amount, locale.value, props.currency)
}

function timeOnly(value: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }
}

const openingFloatRequired = computed(() => props.cash.opening_float_source === 'required')

const openingFloatDisplay = computed(() => {
  if (props.cash.opening_float_source === 'previous_close') return t('dayClose.cash.openingFloatInherited')
  if (props.cash.opening_float_source === 'restaurant_default') return t('dayClose.cash.openingFloatDefault')
  return null
})

/** §16 — a live preview only; the backend's own expected_cash (once the opening float is known) is what this is actually compared against. */
const localDifference = computed<number | null>(() => {
  if (props.cash.expected_cash === null) return null
  const counted = Number(props.countedCash)
  const expected = Number(props.cash.expected_cash)
  if (Number.isNaN(counted)) return null
  return Math.round((counted - expected) * 100) / 100
})

const differenceLabel = computed(() => {
  const diff = localDifference.value
  if (diff === null) return null
  if (diff === 0) return t('dayClose.cash.differenceCorrect')
  const amount = money(Math.abs(diff).toFixed(2))
  return diff < 0 ? t('dayClose.cash.differenceShort', { amount }) : t('dayClose.cash.differenceOver', { amount })
})

const differenceExceedsThreshold = computed(() => {
  const diff = localDifference.value
  if (diff === null) return false
  return Math.abs(diff) > Number(props.cash.cash_difference_note_threshold)
})
</script>

<template>
  <SectionCard :icon="PhCashRegister" :title="t('dayClose.cash.title')">
    <fieldset class="flex flex-col gap-4">
      <legend class="sr-only">{{ t('dayClose.cash.title') }}</legend>

      <div>
        <span class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.cash.openingFloat') }}</span>
        <template v-if="!openingFloatRequired">
          <p class="mt-1 text-title-md font-semibold text-on-surface">{{ money(cash.suggested_opening_float ?? '0.00') }}</p>
          <p v-if="openingFloatDisplay" class="text-label-md text-on-surface-variant">{{ openingFloatDisplay }}</p>
        </template>
        <ATextField
          v-else
          class="mt-1.5"
          :model-value="openingFloatInput"
          :label="t('dayClose.cash.openingFloatRequiredLabel')"
          :help-text="t('dayClose.cash.openingFloatRequiredHelp')"
          inputmode="decimal"
          @update:model-value="emit('update:openingFloatInput', $event)"
          @blur="emit('opening-float-blur')"
        />
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <span class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.cashReceived') }}</span>
          <p class="text-body-lg font-medium tabular-nums text-on-surface">{{ money(cash.cash_received) }}</p>
        </div>
        <div>
          <span class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.payIns') }}</span>
          <p class="text-body-lg font-medium tabular-nums text-on-surface">{{ money(cash.cash_pay_ins) }}</p>
        </div>
        <div>
          <span class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.payOuts') }}</span>
          <p class="text-body-lg font-medium tabular-nums text-on-surface">{{ money(cash.cash_pay_outs) }}</p>
        </div>
        <div>
          <span class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.expectedCash') }}</span>
          <p class="text-body-lg font-semibold tabular-nums text-on-surface">{{ cash.expected_cash !== null ? money(cash.expected_cash) : '—' }}</p>
        </div>
      </div>
    </fieldset>

    <!-- Movimientos de caja -->
    <div class="mt-5 border-t border-outline-variant pt-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-label-lg font-semibold text-on-surface">{{ t('dayClose.cash.movementsTitle') }}</p>
        <div class="flex gap-2">
          <AButton variant="outlined" @click="emit('add-movement', 'pay_in')">
            <template #leading><PhArrowCircleDown :size="16" /></template>
            {{ t('dayClose.cash.addPayIn') }}
          </AButton>
          <AButton variant="outlined" @click="emit('add-movement', 'pay_out')">
            <template #leading><PhArrowCircleUp :size="16" /></template>
            {{ t('dayClose.cash.addPayOut') }}
          </AButton>
        </div>
      </div>

      <EmptyState v-if="!movementsLoading && movements.length === 0" :icon="PhCashRegister" :message="t('dayClose.cash.movementsEmpty')" class="mt-2" />
      <ul v-else class="mt-2 flex flex-col divide-y divide-outline-variant">
        <li v-for="movement in movements" :key="movement.id" class="flex flex-col gap-0.5 py-2.5">
          <div class="flex items-center justify-between gap-2 text-body-md font-medium text-on-surface">
            <span>{{ timeOnly(movement.recorded_at) }} · {{ movement.type === 'pay_in' ? t('dayClose.cash.addPayIn') : t('dayClose.cash.addPayOut') }}</span>
            <span class="tabular-nums">{{ money(movement.amount) }}</span>
          </div>
          <p class="text-label-md text-on-surface-variant">{{ movement.reason }}</p>
          <p class="text-label-md text-on-surface-variant">{{ movement.recorded_by.name }}</p>
        </li>
      </ul>
    </div>

    <!-- Efectivo contado + diferencia -->
    <div class="mt-5 border-t border-outline-variant pt-4">
      <ATextField
        :model-value="countedCash"
        :label="t('dayClose.cash.countedCashLabel')"
        :help-text="t('dayClose.cash.countedCashHelp')"
        inputmode="decimal"
        required
        @update:model-value="emit('update:countedCash', $event)"
      />

      <div
        v-if="differenceLabel !== null"
        class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5"
        :class="localDifference === 0 ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container'"
      >
        <span class="text-label-lg font-medium">{{ t('dayClose.cash.difference') }}:</span>
        <span class="text-body-lg font-semibold">{{ differenceLabel }}</span>
      </div>

      <div v-if="differenceExceedsThreshold" class="mt-3 flex flex-col gap-1.5">
        <label for="cash-difference-note" class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.cash.differenceNoteLabel') }}</label>
        <textarea
          id="cash-difference-note"
          :value="cashDifferenceNote"
          rows="2"
          class="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @input="emit('update:cashDifferenceNote', ($event.target as HTMLTextAreaElement).value)"
        />
        <p class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.differenceNoteHelp') }}</p>
      </div>

      <ATextField
        class="mt-3"
        :model-value="cashLeftForNextDay"
        :label="t('dayClose.cash.cashLeftLabel')"
        :help-text="t('dayClose.cash.cashLeftHelp')"
        inputmode="decimal"
        @update:model-value="emit('update:cashLeftForNextDay', $event)"
      />
    </div>
  </SectionCard>
</template>
