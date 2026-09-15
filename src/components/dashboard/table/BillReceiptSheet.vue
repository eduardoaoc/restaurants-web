<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPrinter } from '@phosphor-icons/vue'

import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { tableSessionsService } from '@/services/table-sessions.service'
import type { BillReceipt } from '@/types/table-sessions'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

/**
 * "Receipt" (Passo 3.4 §15) — an OPERATIONAL document (GET .../receipt),
 * explicitly never called a fiscal invoice anywhere in this UI (no VAT
 * breakdown/invoice number are in the payload to begin with — see
 * BillReceipt's own docblock). Available regardless of payment/session
 * state, same as the backend's own contract. Printing follows
 * TableQrPanel's established teleported-print-sheet pattern rather than
 * inventing a second one.
 */
const props = defineProps<{ tableSessionId: number; currency: string; timezone: string }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()

const receipt = ref<BillReceipt | null>(null)
const loading = ref(false)
const error = ref<ApiError | null>(null)
const printing = ref(false)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    receipt.value = await tableSessionsService.receipt(props.tableSessionId)
  } catch (err) {
    error.value = normalizeApiError(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: props.timezone }).format(
    new Date(value),
  )
}

/**
 * Registers the PrintRecord server-side (repeatable — every click is a
 * legitimate reprint), then hands off to the browser's own print dialog on
 * the teleported `.receipt-print-sheet` below — never a second document
 * generator (§15 "pode permitir browser print").
 */
async function print(): Promise<void> {
  printing.value = true
  try {
    await tableSessionsService.receiptPrint(props.tableSessionId)
  } catch {
    // A failed print-record (e.g. bill_receipt_printing_enabled is off) still
    // lets the browser print dialog open below — this is a soft audit trail,
    // never a gate on the user's ability to print what they're already viewing.
  } finally {
    printing.value = false
    window.print()
  }
}
</script>

<template>
  <ABottomSheet :label="t('tableDrawer.receipt.title')" @close="emit('close')">
    <div v-if="loading" class="flex justify-center py-6">
      <AProgress size="sm" />
    </div>
    <p v-else-if="error" class="text-body-md text-error" role="alert">{{ describeApiError(error, t) }}</p>

    <template v-else-if="receipt">
      <div class="flex flex-col gap-4">
        <div>
          <p class="text-title-md font-semibold text-on-surface">{{ receipt.restaurant.name }}</p>
          <p class="text-label-md text-on-surface-variant">{{ receipt.table.name }}</p>
          <p class="text-label-md text-on-surface-variant">{{ t('tableDrawer.receipt.opened', { at: timestamp(receipt.opened_at) }) }}</p>
          <p v-if="receipt.closed_at" class="text-label-md text-on-surface-variant">
            {{ t('tableDrawer.receipt.closed', { at: timestamp(receipt.closed_at) }) }}
          </p>
        </div>

        <div class="flex flex-col divide-y divide-outline-variant">
          <div v-for="(order, index) in receipt.orders" :key="order.id" class="py-3 first:pt-0 last:pb-0">
            <p class="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
              {{ t('tableDrawer.receipt.order', { number: index + 1 }) }}
            </p>
            <ul class="mt-1.5 flex flex-col gap-1.5">
              <li v-for="(item, itemIndex) in order.items" :key="itemIndex">
                <div class="flex items-start justify-between gap-3">
                  <p class="text-body-md text-on-surface">{{ item.quantity }}× {{ item.name }}</p>
                  <p class="shrink-0 text-body-md font-medium tabular-nums text-on-surface">
                    {{ formatMoney(item.line_total, locale, currency) }}
                  </p>
                </div>
                <p v-if="item.modifiers.length > 0" class="text-label-md text-on-surface-variant">
                  {{ item.modifiers.map((m) => m.name).join(', ') }}
                </p>
              </li>
            </ul>
          </div>
        </div>

        <div class="flex flex-col gap-1 border-t border-outline-variant pt-3">
          <div class="flex items-center justify-between text-body-md text-on-surface-variant">
            <span>{{ t('tableDrawer.bill.ordersTotal') }}</span>
            <span class="tabular-nums">{{ formatMoney(receipt.orders_total, locale, currency) }}</span>
          </div>
          <div v-for="payment in receipt.payments" :key="payment.id" class="flex items-center justify-between text-body-md text-on-surface-variant">
            <span>{{ t(`tableDrawer.bill.method.${payment.method}`) }}</span>
            <span class="tabular-nums">{{ formatMoney(payment.amount, locale, currency) }}</span>
          </div>
          <div class="flex items-center justify-between text-title-md font-semibold text-on-surface">
            <span>{{ Number(receipt.balance) > 0 ? t('tableDrawer.bill.dueNow') : t('tableDrawer.bill.paidInFull') }}</span>
            <span class="tabular-nums">{{ formatMoney(receipt.balance, locale, currency) }}</span>
          </div>
        </div>
      </div>

      <!-- Print sheet: hidden on screen, teleported to <body> so #app can be
           fully removed from the print layout (TableQrPanel's own pattern —
           avoids the page printing behind the modal). -->
      <Teleport to="body">
        <div class="receipt-print-sheet" aria-hidden="true">
          <p class="receipt-print-restaurant">{{ receipt.restaurant.name }}</p>
          <p class="receipt-print-table">{{ receipt.table.name }}</p>
          <p class="receipt-print-line">{{ t('tableDrawer.receipt.opened', { at: timestamp(receipt.opened_at) }) }}</p>
          <div v-for="(order, index) in receipt.orders" :key="order.id" class="receipt-print-order">
            <p class="receipt-print-order-title">{{ t('tableDrawer.receipt.order', { number: index + 1 }) }}</p>
            <div v-for="(item, itemIndex) in order.items" :key="itemIndex" class="receipt-print-item">
              <span>{{ item.quantity }}× {{ item.name }}</span>
              <span>{{ formatMoney(item.line_total, locale, currency) }}</span>
            </div>
          </div>
          <div class="receipt-print-total">
            <span>{{ t('tableDrawer.bill.ordersTotal') }}</span>
            <span>{{ formatMoney(receipt.orders_total, locale, currency) }}</span>
          </div>
        </div>
      </Teleport>
    </template>

    <template v-if="receipt" #footer>
      <AButton full-width variant="outlined" :loading="printing" @click="print">
        <template #leading><PhPrinter :size="16" /></template>
        {{ t('tableDrawer.receipt.print') }}
      </AButton>
    </template>
  </ABottomSheet>
</template>

<style>
.receipt-print-sheet {
  display: none;
}

@media print {
  #app {
    display: none !important;
  }

  .receipt-print-sheet {
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    gap: 8px;
    padding: 24px;
    background: #ffffff;
    color: #000000;
    font-size: 13px;
  }

  .receipt-print-restaurant {
    font-size: 18px;
    font-weight: 700;
  }

  .receipt-print-order {
    margin-top: 8px;
  }

  .receipt-print-order-title {
    font-weight: 700;
    margin-bottom: 4px;
  }

  .receipt-print-item {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .receipt-print-total {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #000000;
    font-weight: 700;
  }
}
</style>
