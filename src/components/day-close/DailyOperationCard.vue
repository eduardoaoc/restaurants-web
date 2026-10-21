<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalendarCheck, PhCalendarX } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ATextField from '@/components/ui/ATextField.vue'
import type { DailyOperationState } from '@/types/daily-operation'
import { describeApiError } from '@/utils/error-message'
import { formatDateOnly, formatMoney } from '@/utils/format'
import { moneyToCents, parseMoneyInput } from '@/utils/price'

/**
 * Operational day: opening form (opening float + a nudge to review
 * availability, rendered by the parent right below) or the open day's state.
 * The float is read-only once opened — there is no audited adjustment yet.
 * Nothing here decides anything: the backend state is always what is shown.
 */
const MAX_OPENING_FLOAT = '50000.00'

const props = defineProps<{
  state: DailyOperationState | null
  loading: boolean
  error: ApiError | null
  opening: boolean
  openError: ApiError | null
}>()
const emit = defineEmits<{ open: [string]; refresh: [] }>()

const { t, locale } = useI18n()
const floatInput = ref('')
const touched = ref(false)

const currency = computed(() => props.state?.cash?.currency ?? 'EUR')
const money = (amount: string) => formatMoney(amount, locale.value, currency.value)

// Prefill once per state with the backend suggestion (never invented here).
watch(() => props.state?.cash?.suggested_opening_float, (suggested) => {
  if (!touched.value) floatInput.value = suggested ?? ''
}, { immediate: true })

/** Same parser as the Cierre: "12,50" and "12.50" → "12.50"; empty is never zero. */
const normalizedFloat = computed(() => parseMoneyInput(floatInput.value))
const floatError = computed(() => {
  if (!touched.value && floatInput.value === '') return ''
  if (normalizedFloat.value === null) return t('dailyOperation.invalidAmount')
  if (moneyToCents(normalizedFloat.value) > moneyToCents(MAX_OPENING_FLOAT)) return t('dailyOperation.tooHigh', { max: money(MAX_OPENING_FLOAT) })
  return ''
})
const canSubmit = computed(() => !props.opening && normalizedFloat.value !== null && floatError.value === '')

const suggestion = computed(() => {
  const cash = props.state?.cash
  if (!cash?.suggested_opening_float) return ''
  const source = t(`dailyOperation.suggestedSources.${cash.suggested_opening_float_source}`)
  return `${t('dailyOperation.suggested', { amount: money(cash.suggested_opening_float) })}${source ? ` · ${source}` : ''}`
})

const openErrorMessage = computed(() => {
  const err = props.openError
  if (!err) return ''
  if (err.code === 'BUSINESS_DATE_ALREADY_CLOSED') return t('dailyOperation.errors.dateClosed')
  return describeApiError(err, t)
})

function time(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(iso))
  }
}

function submit(): void {
  touched.value = true
  if (!canSubmit.value) return
  emit('open', normalizedFloat.value!)
}

function onInput(value: string): void {
  touched.value = true
  floatInput.value = value
}
</script>

<template>
  <SectionCard :icon="state?.status === 'open' ? PhCalendarCheck : PhCalendarX" :title="t('dailyOperation.title')">
    <div v-if="loading && !state" class="flex justify-center py-4"><AProgress /></div>

    <div v-else-if="error && !state" role="alert" class="flex flex-col items-start gap-3">
      <p class="text-body-md text-error">{{ describeApiError(error, t) }}</p>
      <AButton variant="outlined" @click="emit('refresh')">{{ t('dailyOperation.retry') }}</AButton>
    </div>

    <template v-else-if="state?.status === 'open' && state.current">
      <p class="text-title-md font-semibold text-on-surface">{{ t('dailyOperation.openState', { date: formatDateOnly(state.current.business_date, locale) }) }}</p>
      <p class="text-body-md text-on-surface-variant">{{ t('dailyOperation.openedBy', { name: state.current.opened_by.name, time: time(state.current.opened_at, state.current.timezone) }) }}</p>
      <div v-if="state.cash?.opening_float !== undefined" class="mt-3 grid gap-2 sm:grid-cols-2">
        <p class="rounded-lg bg-surface-container-high p-3 text-body-lg text-on-surface">{{ t('dailyOperation.openingFloatValue', { amount: money(state.cash.opening_float) }) }}</p>
        <p class="rounded-lg bg-surface-container-high p-3 text-body-lg text-on-surface">{{ t('dailyOperation.received', { amount: money(state.cash.received ?? '0.00') }) }}</p>
      </div>
      <p v-if="state.cash?.opening_float !== undefined" class="mt-2 text-label-md text-on-surface-variant">{{ t('dailyOperation.floatNotSales') }} {{ t('dailyOperation.readOnlyFloat') }}</p>
      <p class="mt-2 text-label-md text-on-surface-variant">{{ t('dailyOperation.closeHint') }}</p>
    </template>

    <template v-else-if="state">
      <p class="text-title-md font-semibold text-on-surface">{{ t('dailyOperation.notOpen') }}</p>
      <p v-if="state.next_business_date" class="text-body-md text-on-surface-variant">{{ t('dailyOperation.businessDate', { date: formatDateOnly(state.next_business_date, locale) }) }}</p>
      <p v-if="state.last_close" class="text-label-md text-on-surface-variant">{{ t('dailyOperation.lastClose', { date: formatDateOnly(state.last_close.business_date, locale) }) }}</p>

      <p v-if="!state.can.open" class="mt-3 text-body-md text-on-surface">{{ t('dailyOperation.notOpenStaff') }}</p>

      <form v-else class="mt-4 flex max-w-md flex-col gap-3" novalidate @submit.prevent="submit">
        <ATextField
          :model-value="floatInput"
          name="opening_float"
          inputmode="decimal"
          autocomplete="off"
          required
          :label="t('dailyOperation.openingFloat')"
          :help-text="suggestion || t('dailyOperation.openingFloatHelp')"
          :error="floatError"
          :disabled="opening"
          @update:model-value="onInput"
        />
        <p v-if="suggestion" class="-mt-1 text-label-md text-on-surface-variant">{{ t('dailyOperation.openingFloatHelp') }}</p>
        <p class="text-label-md text-on-surface-variant">{{ t('dailyOperation.reviewAvailability') }}</p>
        <p v-if="openErrorMessage" role="alert" class="text-body-md text-error">{{ openErrorMessage }}</p>
        <AButton type="submit" class="self-start" :loading="opening" :disabled="!canSubmit">
          {{ opening ? t('dailyOperation.opening') : t('dailyOperation.openCta') }}
        </AButton>
      </form>
    </template>
  </SectionCard>
</template>
