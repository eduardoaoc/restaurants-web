<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhReceipt } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { ordersService } from '@/services/orders.service'
import type { Order } from '@/types/orders'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ tableSessionId: number; currency: string; refreshKey?: object }>()
// Bubbles up (TableDetailsDrawer -> ServiceView) so the table's own
// primary_status/orders.ready count — READY -> SERVED can change both —
// refetches from the same authoritative operations snapshot the rest of
// the drawer already relies on, never a locally-guessed table state.
const emit = defineEmits<{ served: [] }>()

const { t, locale } = useI18n()
const { can } = usePermissions()
// serve_orders only (CLAUDE.md §9) — never a role check. Kitchen accounts
// hold update_kitchen_status, not serve_orders, so KDS never sees this.
const canServe = computed(() => can('serve_orders'))
const orders = ref<Order[] | null>(null)
const error = ref<ApiError | null>(null)
const servingId = ref<number | null>(null)
const serveError = reactive<Record<number, ApiError | null>>({})

const STATUS_KEYS = [
  'waiting_approval',
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'served',
  'rejected',
  'cancelled',
]

function statusLabel(status: string): string {
  return STATUS_KEYS.includes(status) ? t(`tableDrawer.orders.status.${status}`) : status
}

let controller: AbortController | null = null
async function fetchOrders(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  error.value = null
  try {
    const result = await ordersService.list({ table_session_id: props.tableSessionId }, request.signal)
    if (!request.signal.aborted) orders.value = result
  } catch (err) {
    if (!request.signal.aborted) error.value = normalizeApiError(err)
  }
}
watch(() => [props.tableSessionId, props.refreshKey], fetchOrders, { immediate: true })
onBeforeUnmount(() => controller?.abort())

/**
 * READY -> SERVED, explicit waiter action only (never automatic — Passo
 * 3.3 §2). `updated` is the backend's own authoritative response, applied
 * directly to this order — never a locally-guessed "served" status. A
 * conflict/not_found (another waiter already served it, or the order moved
 * on) always refetches the list instead of trusting anything local, same
 * pattern as useOrderApprovals.act.
 */
async function markServed(order: Order): Promise<void> {
  if (servingId.value !== null) return
  servingId.value = order.id
  serveError[order.id] = null
  try {
    const updated = await ordersService.markServed(order.id)
    if (orders.value) orders.value = orders.value.map((o) => (o.id === updated.id ? updated : o))
    emit('served')
  } catch (err) {
    const normalized = normalizeApiError(err)
    serveError[order.id] = normalized
    if (normalized.kind === 'conflict' || normalized.kind === 'not_found') await fetchOrders()
  } finally {
    servingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="orders === null && !error" class="flex justify-center py-4">
      <AProgress size="sm" />
    </div>
    <p v-else-if="error" class="text-label-md text-error">{{ t('tableDrawer.orders.error') }}</p>
    <EmptyState v-else-if="orders && orders.length === 0" :icon="PhReceipt" :message="t('tableDrawer.orders.empty')" />
    <ul v-else-if="orders" class="flex flex-col divide-y divide-outline-variant">
      <li v-for="order in orders" :key="order.id" class="flex flex-col gap-2 py-2">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-body-md font-medium text-on-surface">{{ order.order_number }}</p>
            <p class="text-label-md text-on-surface-variant">{{ statusLabel(order.status) }}</p>
          </div>
          <span class="shrink-0 text-body-md font-medium text-on-surface">{{ formatMoney(order.total, locale, currency) }}</span>
        </div>

        <div v-if="order.status === 'ready' && canServe" class="flex flex-col items-start gap-1.5">
          <AButton
            variant="tonal"
            :loading="servingId === order.id"
            :disabled="servingId !== null && servingId !== order.id"
            @click="markServed(order)"
          >
            <template #leading>
              <PhCheckCircle :size="18" />
            </template>
            {{ t('tableDrawer.orders.actions.markServed') }}
          </AButton>
          <p v-if="serveError[order.id]" class="text-label-md text-error" role="alert">
            {{ describeApiError(serveError[order.id]!, t) }}
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>
