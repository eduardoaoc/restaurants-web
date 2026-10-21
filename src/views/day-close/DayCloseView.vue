<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { normalizeApiError, type ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import DayCloseCashCard from '@/components/day-close/DayCloseCashCard.vue'
import DayCloseCashMovementDialog from '@/components/day-close/DayCloseCashMovementDialog.vue'
import DayCloseHistoryTab from '@/components/day-close/DayCloseHistoryTab.vue'
import DayCloseReviewDialog from '@/components/day-close/DayCloseReviewDialog.vue'
import DayCloseSectionsSummary from '@/components/day-close/DayCloseSectionsSummary.vue'
import DayCloseStatusCard from '@/components/day-close/DayCloseStatusCard.vue'
import DayCloseSuccessCard from '@/components/day-close/DayCloseSuccessCard.vue'
import DayCloseVoidSessionDialog from '@/components/day-close/DayCloseVoidSessionDialog.vue'
import DayCloseWarningsCard from '@/components/day-close/DayCloseWarningsCard.vue'
import DailyOperationCard from '@/components/day-close/DailyOperationCard.vue'
import ProductAvailabilityPanel from '@/components/service/ProductAvailabilityPanel.vue'
import { useCashMovements } from '@/composables/useCashMovements'
import { useDailyOperation } from '@/composables/useDailyOperation'
import { useProductAvailability } from '@/composables/useProductAvailability'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { useDayCloseHistory, type DayCloseHistoryFilters } from '@/composables/useDayCloseHistory'
import { useDayClosePreview } from '@/composables/useDayClosePreview'
import { useDayCloseSubmit } from '@/composables/useDayCloseSubmit'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantStore } from '@/stores/restaurant'
import { tableSessionsService } from '@/services/table-sessions.service'
import type { CreateCashMovementPayload } from '@/types/cash-movement'
import type { CreateDayClosePayload, DayClose } from '@/types/day-close'
import { describeApiError } from '@/utils/error-message'
import { parseMoneyInput } from '@/utils/price'

/**
 * CARTA 9.1B — "Cierre Diario". Single-screen (non-wizard) orchestration of
 * Estado → Resumen del período → Caja → Incidencias → Observaciones →
 * Cierre, against the exact CARTA 9.1A contract. No PDF/WhatsApp (out of
 * scope), no role-string gating — every CTA reads a real permission slug.
 */
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const restaurantStore = useRestaurantStore()
const { can } = usePermissions()

const canCloseNormal = computed(() => can('close_daily_operation'))
const canOpenDay = computed(() => can('open_daily_operation'))
const canViewHistory = computed(() => can('view_daily_closes'))
const canShowToday = computed(() => canCloseNormal.value || canOpenDay.value)
const canChangeAvailability = computed(() => can('manage_product_availability') || can('manage_products'))

type Tab = 'today' | 'history'
const activeTab = ref<Tab>(canViewHistory.value && route.query.tab === 'history' ? 'history' : canShowToday.value ? 'today' : 'history')

const restaurantId = () => restaurantStore.currentRestaurantId
const todayEnabled = () => activeTab.value === 'today' && canShowToday.value
const historyEnabled = () => activeTab.value === 'history' && canViewHistory.value

// Operational day first: the existing close flow only runs on an open day
// (opening float, then service, then this close finishes the day).
const daily = useDailyOperation(restaurantId, todayEnabled)
const dayOpen = computed(() => daily.state.value?.status === 'open')
const closeEnabled = () => todayEnabled() && canCloseNormal.value && dayOpen.value
const availability = useProductAvailability(
  () => todayEnabled() && canChangeAvailability.value && daily.state.value?.status === 'not_open',
  () => realtime.refresh(),
)
// Same realtime/fallback cycle as Service/Dashboard — no extra timer here.
const realtime = useRestaurantRealtime(restaurantId, todayEnabled, {
  refresh: async () => {
    await Promise.all([daily.refetch(), availability.refetch()])
    return [daily.error.value, availability.error.value]
  },
})

const preview = useDayClosePreview(restaurantId, closeEnabled)
const cashMovements = useCashMovements(restaurantId, closeEnabled)
const history = useDayCloseHistory(restaurantId, historyEnabled)
const submit = useDayCloseSubmit(restaurantId, () => canCloseNormal.value)

// Form fields owned by this view (CreateDayClosePayload's own fields).
const openingFloatInput = ref('')
const countedCash = ref('')
const cashLeftForNextDay = ref('')
const cashDifferenceNote = ref('')
const notes = ref('')

const successDayClose = ref<DayClose | null>(null)

const showReviewDialog = ref(false)
const movementDialogType = ref<'pay_in' | 'pay_out' | null>(null)
const voidTarget = ref<number | null>(null)
const voidSubmitting = ref(false)
const voidError = ref<ApiError | null>(null)
const voidSuccessMessage = ref<string | null>(null)
const movementSuccessMessage = ref<string | null>(null)

/** §28/§29/§30 — structural 409/422 banners; never an automatic retry. */
const cashExpectationBanner = ref<{ before: string | null; now: string | null } | null>(null)
const periodChangedBanner = ref(false)
const businessDateClosedBanner = ref(false)

function resetForm(): void {
  openingFloatInput.value = ''
  countedCash.value = ''
  cashLeftForNextDay.value = ''
  cashDifferenceNote.value = ''
  notes.value = ''
  successDayClose.value = null
  showReviewDialog.value = false
  movementDialogType.value = null
  voidTarget.value = null
  voidError.value = null
  voidSuccessMessage.value = null
  movementSuccessMessage.value = null
  cashExpectationBanner.value = null
  periodChangedBanner.value = false
  businessDateClosedBanner.value = false
  submit.resetAttempt()
}

// §42 — nothing from the previous restaurant survives a switch.
watch(() => restaurantStore.currentRestaurantId, resetForm)

watch(activeTab, () => {
  cashExpectationBanner.value = null
  periodChangedBanner.value = false
  businessDateClosedBanner.value = false
})

// Any edit to a close-relevant field invalidates the previous confirm attempt (§26).
watch([openingFloatInput, countedCash, cashLeftForNextDay, cashDifferenceNote, notes], () => submit.resetAttempt())

function onOpeningFloatBlur(): void {
  const value = parseMoneyInput(openingFloatInput.value)
  if (preview.preview.value?.cash.opening_float_source === 'required' && value) {
    void preview.refetchWithOpeningFloat(value)
  }
}

/**
 * Every refetch after the initial load must re-send a manually entered
 * opening float, or a 'required' preview would silently drop back to
 * `expected_cash: null` (and disable both close CTAs) the moment ANY
 * refresh fires — void, a cash movement, CLOSE_BLOCKED, ... — even though
 * the field still shows the value the user already typed.
 */
function refreshPreview(): void {
  const value = parseMoneyInput(openingFloatInput.value)
  if (preview.preview.value?.cash.opening_float_source === 'required' && value) {
    void preview.refetchWithOpeningFloat(value)
  } else {
    preview.refetch()
  }
}

/**
 * Typed amounts as the canonical decimal strings the contract expects
 * ("100,00" and "100.00" → "100.00"); null = empty or invalid, never zero.
 * The same values feed the preview, the visible difference and the POST.
 */
const parsedCounted = computed(() => parseMoneyInput(countedCash.value))
const parsedCashLeft = computed(() => parseMoneyInput(cashLeftForNextDay.value))
const parsedOpeningFloat = computed(() => parseMoneyInput(openingFloatInput.value))
const amountsValid = computed(() => parsedCounted.value !== null
  && (cashLeftForNextDay.value.trim() === '' || parsedCashLeft.value !== null)
  && (preview.preview.value?.cash.opening_float_source !== 'required' || parsedOpeningFloat.value !== null))

function buildPayload(): CreateDayClosePayload | null {
  const p = preview.preview.value
  if (!p || p.cash.expected_cash === null || !amountsValid.value) return null
  return {
    period_started_at: p.period.period_started_at,
    expected_cash_seen: p.cash.expected_cash,
    opening_float: p.cash.opening_float_source === 'required' ? parsedOpeningFloat.value! : undefined,
    counted_cash: parsedCounted.value!,
    cash_left_for_next_day: parsedCashLeft.value ?? undefined,
    cash_difference_note: cashDifferenceNote.value.trim() || undefined,
    notes: notes.value.trim() || undefined,
  }
}

function handleSubmitError(): void {
  const err = submit.error.value
  if (!err) return

  if (err.code === 'CASH_EXPECTATION_CHANGED') {
    cashExpectationBanner.value = { before: preview.preview.value?.cash.expected_cash ?? null, now: submit.currentExpectedCash.value }
    showReviewDialog.value = false
    refreshPreview()
    return
  }
  if (err.code === 'PERIOD_CHANGED') {
    periodChangedBanner.value = true
    showReviewDialog.value = false
    refreshPreview()
    return
  }
  if (err.code === 'BUSINESS_DATE_ALREADY_CLOSED') {
    businessDateClosedBanner.value = true
    showReviewDialog.value = false
    refreshPreview()
    return
  }
  if (err.code === 'CLOSE_BLOCKED') {
    // Never an override — just re-show the real blockers from a fresh preview.
    showReviewDialog.value = false
    refreshPreview()
    return
  }
  // Any other error stays on-screen inside the open dialog (describeApiError already shown there).
}

async function onConfirmReview(): Promise<void> {
  const payload = buildPayload()
  if (!payload) return
  const result = await submit.submit(payload)
  if (result) {
    successDayClose.value = result
    showReviewDialog.value = false
    void daily.refetch()
    return
  }
  handleSubmitError()
}

function onRequestVoid(sessionId: number): void {
  voidTarget.value = sessionId
  voidError.value = null
}

async function onConfirmVoid(reason: string | undefined): Promise<void> {
  if (voidTarget.value === null) return
  voidSubmitting.value = true
  voidError.value = null
  try {
    await tableSessionsService.void(voidTarget.value, { reason })
    voidTarget.value = null
    voidSuccessMessage.value = t('dayClose.status.voidSuccess')
    refreshPreview()
  } catch (err) {
    voidError.value = normalizeApiError(err)
  } finally {
    voidSubmitting.value = false
  }
}

async function onSubmitMovement(payload: CreateCashMovementPayload): Promise<void> {
  const ok = await cashMovements.submit(payload)
  if (ok) {
    movementDialogType.value = null
    movementSuccessMessage.value = t('dayClose.cash.movementSuccess')
    refreshPreview()
  }
}

function goToDetail(): void {
  if (!successDayClose.value) return
  void router.push({ name: 'app-day-close-detail', params: { id: String(successDayClose.value.id) } })
}

function onHistoryFiltersChanged(filters: DayCloseHistoryFilters): void {
  void history.setFilters(filters)
}

const canSubmitClose = computed(() => amountsValid.value && preview.preview.value?.cash.expected_cash !== null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="inline-flex gap-1 self-start rounded-lg border border-outline-variant bg-surface-container-low p-1" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'today'"
        class="min-h-11 rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="activeTab === 'today' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
        @click="activeTab = 'today'"
      >
        {{ t('dayClose.tabs.today') }}
      </button>
      <button
        v-if="canViewHistory"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'history'"
        class="min-h-11 rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="activeTab === 'history' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
        @click="activeTab = 'history'"
      >
        {{ t('dayClose.tabs.history') }}
      </button>
    </div>

    <template v-if="activeTab === 'today'">
      <ASurface v-if="!canShowToday" tone="container" radius="lg" class="max-w-xl p-6">
        <p class="text-body-lg text-on-surface">{{ t('dayClose.noAccess') }}</p>
      </ASurface>

      <template v-else-if="successDayClose">
        <DayCloseSuccessCard :day-close="successDayClose" @view-detail="goToDetail" />
      </template>

      <template v-else-if="!dayOpen">
        <DailyOperationCard
          :state="daily.state.value"
          :loading="daily.loading.value"
          :error="daily.error.value"
          :opening="daily.opening.value"
          :open-error="daily.openError.value"
          @open="daily.open($event)"
          @refresh="daily.refetch()"
        />
        <ProductAvailabilityPanel
          v-if="canChangeAvailability && daily.state.value?.status === 'not_open'"
          :key="restaurantStore.currentRestaurantId ?? 0"
          :products="availability.products.value"
          :loading="availability.loading.value"
          :error="availability.error.value"
          :busy="availability.busy"
          :errors="availability.errors"
          @toggle="availability.toggle"
          @refresh="realtime.refresh"
        />
      </template>

      <template v-else-if="!canCloseNormal">
        <DailyOperationCard
          :state="daily.state.value"
          :loading="daily.loading.value"
          :error="daily.error.value"
          :opening="daily.opening.value"
          :open-error="daily.openError.value"
          @refresh="daily.refetch()"
        />
      </template>

      <template v-else>
        <DailyOperationCard
          :state="daily.state.value"
          :loading="daily.loading.value"
          :error="daily.error.value"
          :opening="daily.opening.value"
          :open-error="daily.openError.value"
          @refresh="daily.refetch()"
        />
        <div v-if="preview.loading.value && !preview.preview.value" class="flex items-center justify-center py-16">
          <AProgress />
        </div>

        <ASurface v-else-if="preview.error.value" tone="container" radius="lg" class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container">
          <p class="text-body-lg">{{ describeApiError(preview.error.value, t) }}</p>
          <AButton class="mt-3" variant="outlined" @click="preview.refetch()">{{ t('dayClose.refresh') }}</AButton>
        </ASurface>

        <template v-else-if="preview.preview.value">
          <ASurface v-if="cashExpectationBanner" tone="container" radius="lg" class="border border-warning/40 bg-warning-container p-4 text-on-warning-container">
            <p class="text-body-md font-medium">{{ t('dayClose.errors.cashExpectationChanged') }}</p>
            <p v-if="cashExpectationBanner.before" class="mt-1 text-label-md">{{ t('dayClose.errors.cashExpectationBefore', { before: cashExpectationBanner.before }) }}</p>
            <p v-if="cashExpectationBanner.now" class="text-label-md">{{ t('dayClose.errors.cashExpectationNow', { now: cashExpectationBanner.now }) }}</p>
          </ASurface>
          <ASurface v-if="periodChangedBanner" tone="container" radius="lg" class="border border-warning/40 bg-warning-container p-4 text-on-warning-container">
            <p class="text-body-md font-medium">{{ t('dayClose.errors.periodChanged') }}</p>
          </ASurface>
          <ASurface v-if="businessDateClosedBanner" tone="container" radius="lg" class="border border-warning/40 bg-warning-container p-4 text-on-warning-container">
            <p class="text-body-md font-medium">{{ t('dayClose.errors.businessDateAlreadyClosed') }}</p>
          </ASurface>
          <ASurface v-if="voidSuccessMessage" tone="container" radius="lg" class="border border-success/40 bg-success-container p-3 text-on-success-container">
            <p class="text-body-md">{{ voidSuccessMessage }}</p>
          </ASurface>
          <ASurface v-if="movementSuccessMessage" tone="container" radius="lg" class="border border-success/40 bg-success-container p-3 text-on-success-container">
            <p class="text-body-md">{{ movementSuccessMessage }}</p>
          </ASurface>

          <DayCloseStatusCard
            :period="preview.preview.value.period"
            :can-close="preview.preview.value.can_close"
            :blockers="preview.preview.value.blockers"
            @void="onRequestVoid"
          />

          <DayCloseSectionsSummary :sections="preview.preview.value" :currency="preview.preview.value.financial.currency" :timezone="preview.preview.value.period.timezone" />

          <DayCloseWarningsCard :warnings="preview.preview.value.warnings" />

          <DayCloseCashCard
            :cash="preview.preview.value.cash"
            :currency="preview.preview.value.financial.currency"
            :movements="cashMovements.data.value?.movements ?? []"
            :movements-loading="cashMovements.loading.value"
            :opening-float-input="openingFloatInput"
            :counted-cash="countedCash"
            :cash-left-for-next-day="cashLeftForNextDay"
            :cash-difference-note="cashDifferenceNote"
            @update:opening-float-input="openingFloatInput = $event"
            @update:counted-cash="countedCash = $event"
            @update:cash-left-for-next-day="cashLeftForNextDay = $event"
            @update:cash-difference-note="cashDifferenceNote = $event"
            @add-movement="movementDialogType = $event"
            @opening-float-blur="onOpeningFloatBlur"
          />

          <section class="rounded-lg border border-outline-variant bg-surface-container p-5">
            <label for="day-close-notes" class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.notes.label') }}</label>
            <textarea
              id="day-close-notes"
              v-model="notes"
              rows="3"
              class="mt-1.5 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <p class="mt-1 text-label-md text-on-surface-variant">{{ t('dayClose.notes.help') }}</p>
          </section>

          <div class="flex flex-wrap gap-3">
            <AButton v-if="canCloseNormal" :disabled="!canSubmitClose" @click="showReviewDialog = true">{{ t('dayClose.review.cta') }}</AButton>
          </div>

          <DayCloseReviewDialog
            v-if="showReviewDialog"
            :preview="preview.preview.value"
            :currency="preview.preview.value.financial.currency"
            :counted-cash="countedCash"
            :submitting="submit.submitting.value"
            :error="submit.error.value"
            @confirm="onConfirmReview"
            @cancel="showReviewDialog = false"
          />
        </template>

        <DayCloseVoidSessionDialog
          v-if="voidTarget !== null"
          :submitting="voidSubmitting"
          :error="voidError"
          @confirm="onConfirmVoid"
          @cancel="voidTarget = null"
        />

        <DayCloseCashMovementDialog
          v-if="movementDialogType"
          :type="movementDialogType"
          :submitting="cashMovements.submitting.value"
          :error="cashMovements.submitError.value"
          @submit="onSubmitMovement"
          @payload-changed="cashMovements.resetSubmission()"
          @cancel="movementDialogType = null"
        />
      </template>
    </template>

    <template v-else>
      <ASurface v-if="!canViewHistory" tone="container" radius="lg" class="max-w-xl p-6">
        <p class="text-body-lg text-on-surface">{{ t('dayClose.noAccess') }}</p>
      </ASurface>
      <DayCloseHistoryTab
        v-else
        :key="restaurantStore.currentRestaurantId ?? undefined"
        :items="history.items.value"
        :loading="history.loading.value"
        :loading-more="history.loadingMore.value"
        :has-more="history.hasMore.value"
        @load-more="history.loadMore()"
        @filters-changed="onHistoryFiltersChanged"
      />
    </template>
  </div>
</template>
