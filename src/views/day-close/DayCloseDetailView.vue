<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PhCashRegister, PhDownloadSimple, PhNotePencil } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import DayCloseAnnotationDialog from '@/components/day-close/DayCloseAnnotationDialog.vue'
import DayCloseSectionsSummary from '@/components/day-close/DayCloseSectionsSummary.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import { useDayCloseDetail } from '@/composables/useDayCloseDetail'
import { useDayClosePdfDownload } from '@/composables/useDayClosePdfDownload'
import { dayClosePdfFallbackFilename } from '@/services/day-close.service'
import { describeApiError } from '@/utils/error-message'
import { DEFAULT_CURRENCY, formatMoney } from '@/utils/format'

/**
 * CARTA 9.1B §37-§39 — a single persisted Cierre Diario. Everything under
 * `detail.report` (financial/operations/products/product_availability/
 * feedback/delays/cash/closing) is the IMMUTABLE snapshot stored at close
 * time — rendered exactly as stored, never recomputed from today's live
 * data (§38).
 */
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const dayCloseId = computed(() => {
  const raw = route.params.id
  const id = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isFinite(id) ? id : null
})

const { detail, loading, error, retry, addingAnnotation, annotationError, addAnnotation } = useDayCloseDetail(() => dayCloseId.value)
const pdfDownload = useDayClosePdfDownload()

// A new `:id` on the same route instance never carries over the previous close's in-flight/error PDF state.
watch(dayCloseId, () => pdfDownload.reset())

const showAnnotationDialog = ref(false)

function money(amount: string): string {
  return formatMoney(amount, locale.value, detail.value?.currency ?? DEFAULT_CURRENCY)
}

function dateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  }
}

function dateTime(value: string): string {
  const tz = detail.value?.timezone
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(value))
  }
}

async function onSubmitAnnotation(body: string): Promise<void> {
  const ok = await addAnnotation(body)
  if (ok) showAnnotationDialog.value = false
}

function onDownloadPdf(): void {
  if (!detail.value) return
  void pdfDownload.download(detail.value.id, dayClosePdfFallbackFilename(detail.value.business_date))
}

function goBack(): void {
  void router.push({ name: 'app-day-close' })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <AButton variant="text" class="self-start" @click="goBack">{{ t('dayClose.detail.back') }}</AButton>

    <div v-if="loading && !detail" class="flex items-center justify-center py-16">
      <AProgress />
    </div>

    <ASurface v-else-if="error" tone="container" radius="lg" class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container">
      <p class="text-body-lg">{{ describeApiError(error, t) }}</p>
      <AButton class="mt-3" variant="outlined" @click="retry">{{ t('dayClose.refresh') }}</AButton>
    </ASurface>

    <template v-else-if="detail">
      <SectionCard :icon="PhCashRegister" :title="t('dayClose.detail.title')">
        <template #actions>
          <AButton variant="outlined" :loading="pdfDownload.isDownloading(detail.id)" @click="onDownloadPdf">
            <template #leading><PhDownloadSimple :size="16" aria-hidden="true" /></template>
            {{ pdfDownload.isDownloading(detail.id) ? t('dayClose.pdf.downloadingPdf') : t('dayClose.pdf.downloadPdf') }}
          </AButton>
        </template>

        <p class="text-title-md font-semibold text-on-surface">{{ dateOnly(detail.business_date) }}</p>
        <p class="mt-1 text-body-md text-on-surface-variant">{{ t('dayClose.detail.closedBy', { name: detail.closed_by.name, date: dateTime(detail.closed_at) }) }}</p>
        <p v-if="pdfDownload.error.value?.id === detail.id" class="mt-2 text-label-md text-error" role="alert">
          {{ pdfDownload.error.value.message }}
        </p>
      </SectionCard>

      <DayCloseSectionsSummary :sections="detail.report" :currency="detail.currency" :timezone="detail.timezone" />

      <!-- Caja (snapshot — backend's own computed difference, never recomputed here) -->
      <SectionCard :icon="PhCashRegister" :title="t('dayClose.detail.sections.cash')">
        <dl class="grid grid-cols-2 gap-3 text-body-md sm:grid-cols-3">
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.openingFloat') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.opening_float) }}</dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.cashReceived') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.cash_received) }}</dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.payIns') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.cash_pay_ins) }}</dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.payOuts') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.cash_pay_outs) }}</dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.expectedCash') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.expected_cash) }}</dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.countedCashLabel') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.counted_cash) }}</dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.difference') }}</dt>
            <dd class="font-semibold tabular-nums text-on-surface">{{ money(detail.report.cash.cash_difference) }}</dd>
          </div>
          <div v-if="detail.report.cash.cash_left_for_next_day">
            <dt class="text-label-md text-on-surface-variant">{{ t('dayClose.cash.cashLeftLabel') }}</dt>
            <dd class="font-medium tabular-nums text-on-surface">{{ money(detail.report.cash.cash_left_for_next_day) }}</dd>
          </div>
        </dl>
        <p v-if="detail.report.cash.cash_difference_note" class="mt-3 text-body-md text-on-surface">{{ detail.report.cash.cash_difference_note }}</p>

        <div v-if="detail.report.cash.movements.length > 0" class="mt-4 border-t border-outline-variant pt-3">
          <p class="mb-2 text-label-lg font-semibold text-on-surface">{{ t('dayClose.cash.movementsTitle') }}</p>
          <ul class="flex flex-col divide-y divide-outline-variant">
            <li v-for="movement in detail.report.cash.movements" :key="movement.id" class="flex items-center justify-between gap-2 py-2 text-body-md text-on-surface">
              <span>{{ dateTime(movement.recorded_at) }} · {{ movement.reason }}</span>
              <span class="tabular-nums">{{ money(movement.amount) }}</span>
            </li>
          </ul>
        </div>
      </SectionCard>

      <!-- Cierre -->
      <SectionCard :icon="PhCashRegister" :title="t('dayClose.detail.sections.closing')">
        <p v-if="detail.notes" class="text-body-md text-on-surface">{{ detail.notes }}</p>
        <p v-else class="text-body-md text-on-surface-variant">{{ t('dayClose.detail.noNotes') }}</p>
      </SectionCard>

      <!-- Notas posteriores -->
      <SectionCard :icon="PhNotePencil" :title="t('dayClose.detail.sections.annotations')">
        <template #actions>
          <AButton variant="outlined" @click="showAnnotationDialog = true">{{ t('dayClose.detail.addAnnotation') }}</AButton>
        </template>

        <EmptyState v-if="detail.annotations.length === 0" :icon="PhNotePencil" :message="t('dayClose.detail.annotationsEmpty')" />
        <ul v-else class="flex flex-col gap-3">
          <li v-for="annotation in detail.annotations" :key="annotation.id" class="border-b border-outline-variant pb-3 last:border-0 last:pb-0">
            <p class="text-body-md text-on-surface">{{ annotation.body }}</p>
            <p class="mt-1 text-label-md text-on-surface-variant">{{ annotation.created_by.name }} · {{ dateTime(annotation.created_at) }}</p>
          </li>
        </ul>
      </SectionCard>

      <DayCloseAnnotationDialog
        v-if="showAnnotationDialog"
        :submitting="addingAnnotation"
        :error="annotationError"
        @submit="onSubmitAnnotation"
        @cancel="showAnnotationDialog = false"
      />
    </template>
  </div>
</template>
