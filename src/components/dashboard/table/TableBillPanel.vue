<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCreditCard, PhMoney } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AConfirmDialog from '@/components/ui/AConfirmDialog.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { tableSessionsService } from '@/services/table-sessions.service'
import type { RecordPaymentPayload, SessionBill } from '@/types/table-sessions'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

/**
 * "Conta da mesa" (Passo 3.4 §6/§7/§8) — the bill total/breakdown +
 * payment recording, split out of TableDetailsDrawer the same way
 * TableOrdersList already is. Item/modifier-level detail for each order
 * lives in the sibling "Ver pedidos" panel (TableOrdersList already fetches
 * full Order objects with items) — this panel is deliberately totals/
 * payments-only, matching the task's own "separar claramente: ver pedidos /
 * pagar" split.
 *
 * `bill.can_close` is the ONLY signal TableDetailsDrawer uses to gate its
 * Close button (via the `bill-loaded` emit) — verified live against the
 * real backend (Passo 3.4 audit) that can_close can stay false even at
 * balance "0.00" (e.g. an order stuck mid-lifecycle, never served) and that
 * POST /tables/{id}/close itself 409s in that exact case
 * (TABLE_SESSION_HAS_OPEN_ORDERS) — never re-derived from balance here.
 */
const props = defineProps<{
  tableSessionId: number
  currency: string
  refreshKey?: object
  canRecordPayments: boolean
}>()

const emit = defineEmits<{ 'bill-loaded': [SessionBill | null]; changed: [] }>()

const { t, locale } = useI18n()

const bill = ref<SessionBill | null>(null)
const loading = ref(false)
const error = ref<ApiError | null>(null)

let controller: AbortController | null = null
async function fetchBill(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = null
  try {
    const result = await tableSessionsService.bill(props.tableSessionId)
    if (request.signal.aborted) return
    bill.value = result
    emit('bill-loaded', result)
  } catch (err) {
    if (request.signal.aborted) return
    bill.value = null
    error.value = normalizeApiError(err)
    emit('bill-loaded', null)
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
watch(() => [props.tableSessionId, props.refreshKey], fetchBill, { immediate: true })
onBeforeUnmount(() => controller?.abort())

const hasBalance = computed(() => Boolean(bill.value && Number(bill.value.balance) > 0))

// Two-step: pick a method, then an explicit confirm dialog names the exact
// amount/method before anything is sent (§8 "evitar clique acidental") —
// the amount itself is never editable (no split/partial-payment UI, §28),
// always the backend-computed balance in full.
const pendingMethod = ref<'cash' | 'card' | null>(null)
const submitting = ref(false)
const paymentError = ref<ApiError | null>(null)

function selectMethod(method: 'cash' | 'card'): void {
  paymentError.value = null
  pendingMethod.value = method
}

function cancelPayment(): void {
  pendingMethod.value = null
}

async function confirmPayment(): Promise<void> {
  if (!bill.value || !pendingMethod.value) return
  const payload: RecordPaymentPayload = { method: pendingMethod.value, amount: bill.value.balance }
  submitting.value = true
  paymentError.value = null
  try {
    await tableSessionsService.recordPayment(props.tableSessionId, payload)
    pendingMethod.value = null
    emit('changed')
  } catch (err) {
    // A conflict (already paid/closed by someone else) or a stale-balance
    // 422 both mean this view's own numbers are out of date — refetch the
    // authoritative bill instead of leaving the confirm dialog open on
    // amounts that no longer apply (§14 concurrency).
    paymentError.value = normalizeApiError(err)
  } finally {
    submitting.value = false
    await fetchBill()
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="loading && !bill" class="flex justify-center py-4">
      <AProgress size="sm" />
    </div>
    <p v-else-if="error" class="text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>

    <template v-else-if="bill">
      <div class="flex flex-col gap-1.5 rounded-lg bg-surface-container p-3">
        <div class="flex items-center justify-between text-body-md text-on-surface-variant">
          <span>{{ t('tableDrawer.bill.ordersTotal') }}</span>
          <span class="tabular-nums">{{ formatMoney(bill.orders_total, locale, currency) }}</span>
        </div>
        <div class="flex items-center justify-between text-body-md text-on-surface-variant">
          <span>{{ t('tableDrawer.bill.paidTotal') }}</span>
          <span class="tabular-nums">{{ formatMoney(bill.paid_total, locale, currency) }}</span>
        </div>
        <div class="mt-1 flex items-center justify-between border-t border-outline-variant pt-2 text-title-md font-semibold text-on-surface">
          <span>{{ hasBalance ? t('tableDrawer.bill.dueNow') : t('tableDrawer.bill.paidInFull') }}</span>
          <span class="tabular-nums" :class="hasBalance ? 'text-error' : 'text-on-surface'">
            {{ formatMoney(bill.balance, locale, currency) }}
          </span>
        </div>
      </div>

      <div v-if="bill.payments.length > 0" class="flex flex-col gap-1.5">
        <p class="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">{{ t('tableDrawer.bill.payments') }}</p>
        <ul class="flex flex-col divide-y divide-outline-variant">
          <li v-for="payment in bill.payments" :key="payment.id" class="flex items-center justify-between gap-3 py-2">
            <div class="min-w-0">
              <p class="text-body-md text-on-surface">{{ t(`tableDrawer.bill.method.${payment.method}`) }}</p>
              <p class="truncate text-label-md text-on-surface-variant">
                {{ payment.recorded_by?.name ?? t('tableDrawer.unassigned') }}
              </p>
            </div>
            <span class="shrink-0 text-body-md font-medium tabular-nums text-on-surface">
              {{ formatMoney(payment.amount, locale, currency) }}
            </span>
          </li>
        </ul>
      </div>

      <template v-if="canRecordPayments && hasBalance">
        <p class="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">{{ t('tableDrawer.bill.recordPayment') }}</p>
        <div class="grid grid-cols-2 gap-2">
          <AButton variant="outlined" @click="selectMethod('cash')">
            <template #leading><PhMoney :size="18" /></template>
            {{ t('tableDrawer.bill.method.cash') }}
          </AButton>
          <AButton variant="outlined" @click="selectMethod('card')">
            <template #leading><PhCreditCard :size="18" /></template>
            {{ t('tableDrawer.bill.method.card') }}
          </AButton>
        </div>
        <p v-if="paymentError" class="text-label-md text-error" role="alert">{{ describeApiError(paymentError, t) }}</p>
      </template>
    </template>

    <AConfirmDialog
      v-if="pendingMethod && bill"
      :label="t('tableDrawer.bill.confirmTitle')"
      :message="t('tableDrawer.bill.confirmMessage', { amount: formatMoney(bill.balance, locale, currency), method: t(`tableDrawer.bill.method.${pendingMethod}`) })"
      :confirm-label="t('tableDrawer.bill.confirmAction')"
      :loading="submitting"
      @confirm="confirmPayment"
      @cancel="cancelPayment"
    />
  </div>
</template>
