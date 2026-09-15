<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretLeft, PhCheckCircle, PhReceipt } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { ordersService } from '@/services/orders.service'
import type { Order, OrderItem, OrderModifier } from '@/types/orders'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ tableSessionId: number; currency: string; timezone: string; refreshKey?: object }>()
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
const ORIGIN_KEYS = ['customer_qr', 'waiter', 'manager', 'cashier']

function statusLabel(status: string): string {
  return STATUS_KEYS.includes(status) ? t(`tableDrawer.orders.status.${status}`) : status
}

function originLabel(origin: string): string {
  return ORIGIN_KEYS.includes(origin) ? t(`tableDrawer.orders.detail.origin.${origin}`) : origin
}

/**
 * Passo 3.6 §5: each status maps to the real backend timestamp field for
 * that transition (verified against the live Order OpenAPI schema) —
 * `rejected` has no dedicated field there, so it falls back to
 * `updated_at`/`created_at` like every other gap, never an invented field.
 */
function statusTimestamp(order: Order): string {
  const map: Partial<Record<string, string | null | undefined>> = {
    confirmed: order.approved_at,
    accepted: order.accepted_at,
    preparing: order.preparing_at,
    ready: order.ready_at,
    served: order.served_at,
    cancelled: order.cancelled_at,
  }
  return map[order.status] ?? order.updated_at ?? order.created_at
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: props.timezone }).format(
      new Date(iso),
    )
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: props.timezone }).format(
      new Date(iso),
    )
  }
}

/** Display-only grouping of the flat `modifiers` array by its own `group_name` — never re-derives or reorders the underlying data. */
function groupedModifiers(item: OrderItem): { groupName: string; options: OrderModifier[] }[] {
  const groups: { groupName: string; options: OrderModifier[] }[] = []
  for (const modifier of item.modifiers) {
    const existing = groups.find((group) => group.groupName === modifier.group_name)
    if (existing) existing.options.push(modifier)
    else groups.push({ groupName: modifier.group_name, options: [modifier] })
  }
  return groups
}

// §7: a zero price_delta (e.g. a free "Al punto" choice) is never shown as "+0,00 €" clutter.
function modifierPrice(priceDelta: string): string | null {
  const value = Number(priceDelta)
  if (value === 0) return null
  const formatted = formatMoney(priceDelta, locale.value, props.currency)
  return value > 0 ? `+${formatted}` : formatted
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

// §2/§4: the detail pane navigates INSIDE this same component (list <-> detail)
// — never a second sheet/modal. `selectedOrderId` alone decides which half of
// the template renders; the order's number is the only new interactive control.
const selectedOrderId = ref<number | null>(null)
const orderDetail = ref<Order | null>(null)
const detailLoading = ref(false)
const detailError = ref<ApiError | null>(null)
const detailRootRef = ref<HTMLElement | null>(null)
const orderButtonRefs = new Map<number, HTMLElement>()

function setOrderButtonRef(orderId: number, el: Element | null): void {
  if (el instanceof HTMLElement) orderButtonRefs.set(orderId, el)
  else orderButtonRefs.delete(orderId)
}

let detailController: AbortController | null = null
// §4: GET /orders/{order} is the authoritative source for the detail pane —
// the list snapshot is only ever used to know WHICH order was clicked.
// Aborting the previous in-flight request on every call (and ignoring an
// aborted response in the catch) is what makes a rapid double-click safe:
// only the latest click's response is ever applied.
async function fetchOrderDetail(orderId: number): Promise<void> {
  detailController?.abort()
  const request = new AbortController()
  detailController = request
  detailLoading.value = true
  detailError.value = null
  try {
    const result = await ordersService.get(orderId, request.signal)
    if (request.signal.aborted) return
    orderDetail.value = result
  } catch (err) {
    if (request.signal.aborted) return
    detailError.value = normalizeApiError(err)
  } finally {
    if (!request.signal.aborted) detailLoading.value = false
  }
}

function openOrderDetail(order: Order): void {
  selectedOrderId.value = order.id
  orderDetail.value = null
  detailError.value = null
  void fetchOrderDetail(order.id)
  // §19: move focus into the detail pane the moment it opens (mirrors
  // ABottomSheet's own tabindex="-1" + focus() pattern for a new "view").
  void nextTick(() => detailRootRef.value?.focus())
}

function closeDetail(): void {
  const previousId = selectedOrderId.value
  detailController?.abort()
  selectedOrderId.value = null
  orderDetail.value = null
  detailError.value = null
  detailLoading.value = false
  // §14/§19: "Volver" never closes the drawer and returns focus to the
  // exact order number the waiter/owner just came from.
  if (previousId !== null) {
    void nextTick(() => orderButtonRefs.get(previousId)?.focus())
  }
}

watch(
  () => [props.tableSessionId, props.refreshKey],
  () => {
    void fetchOrders()
    // §13: realtime never opens a new socket here — it reuses the same
    // refreshKey/refetch signal already driving the list, so an open detail
    // pane stays in sync with a status change from elsewhere.
    if (selectedOrderId.value !== null) void fetchOrderDetail(selectedOrderId.value)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  controller?.abort()
  detailController?.abort()
})

/**
 * READY -> SERVED, explicit waiter action only (never automatic — Passo
 * 3.3 §2). `updated` is the backend's own authoritative response, applied
 * directly to this order — never a locally-guessed "served" status. A
 * conflict/not_found (another waiter already served it, or the order moved
 * on) always refetches the list instead of trusting anything local, same
 * pattern as useOrderApprovals.act. Shared verbatim between the list row's
 * button and the detail pane's own (§12: same action/service, never a
 * duplicated implementation).
 */
async function markServed(order: Order): Promise<void> {
  if (servingId.value !== null) return
  servingId.value = order.id
  serveError[order.id] = null
  try {
    const updated = await ordersService.markServed(order.id)
    if (orders.value) orders.value = orders.value.map((o) => (o.id === updated.id ? updated : o))
    if (orderDetail.value?.id === updated.id) orderDetail.value = updated
    emit('served')
  } catch (err) {
    const normalized = normalizeApiError(err)
    serveError[order.id] = normalized
    if (normalized.kind === 'conflict' || normalized.kind === 'not_found') {
      await fetchOrders()
      if (selectedOrderId.value === order.id) await fetchOrderDetail(order.id)
    }
  } finally {
    servingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-if="selectedOrderId === null">
      <div v-if="orders === null && !error" class="flex justify-center py-4">
        <AProgress size="sm" />
      </div>
      <p v-else-if="error" class="text-label-md text-error">{{ t('tableDrawer.orders.error') }}</p>
      <EmptyState v-else-if="orders && orders.length === 0" :icon="PhReceipt" :message="t('tableDrawer.orders.empty')" />
      <ul v-else-if="orders" class="flex flex-col divide-y divide-outline-variant">
        <li v-for="order in orders" :key="order.id" class="flex flex-col gap-2 py-2">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <button
                type="button"
                :ref="(el) => setOrderButtonRef(order.id, el as Element | null)"
                class="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 text-body-md font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :aria-label="t('tableDrawer.orders.actions.viewDetail', { number: order.order_number })"
                @click="openOrderDetail(order)"
              >
                {{ order.order_number }}
              </button>
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
    </template>

    <!-- §2/§14: same drawer, internal navigation only — no ABottomSheet/second dialog here. -->
    <div v-else ref="detailRootRef" tabindex="-1" class="flex flex-col gap-4 outline-none">
      <button
        type="button"
        class="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-body-md font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="closeDetail"
      >
        <PhCaretLeft :size="16" aria-hidden="true" />
        {{ t('tableDrawer.orders.detail.back') }}
      </button>

      <div v-if="detailLoading" class="flex justify-center py-6">
        <AProgress size="sm" />
      </div>

      <template v-else-if="detailError">
        <p class="text-body-md text-error" role="alert">{{ describeApiError(detailError, t) }}</p>
        <AButton variant="outlined" class="w-fit" @click="fetchOrderDetail(selectedOrderId)">
          {{ t('tableDrawer.orders.detail.retry') }}
        </AButton>
      </template>

      <template v-else-if="orderDetail">
        <div>
          <h4 class="text-title-md font-semibold text-on-surface">
            {{ t('tableDrawer.orders.detail.title', { number: orderDetail.order_number }) }}
          </h4>
          <p class="mt-1 text-label-md text-on-surface-variant">
            {{ statusLabel(orderDetail.status) }} · {{ formatDateTime(statusTimestamp(orderDetail)) }}
          </p>
          <p class="text-label-md text-on-surface-variant">{{ originLabel(orderDetail.origin) }}</p>
        </div>

        <ul class="flex flex-col divide-y divide-outline-variant">
          <li v-for="(item, itemIndex) in orderDetail.items" :key="itemIndex" class="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div class="flex items-start justify-between gap-3">
              <p class="min-w-0 text-body-lg font-medium text-on-surface">{{ item.quantity }}× {{ item.name }}</p>
              <p class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
                {{ formatMoney(item.line_total, locale, currency) }}
              </p>
            </div>
            <p v-if="item.description" class="text-label-md text-on-surface-variant">{{ item.description }}</p>
            <p class="text-label-md text-on-surface-variant">
              {{ formatMoney(item.unit_price, locale, currency) }} × {{ item.quantity }}
            </p>

            <div v-for="group in groupedModifiers(item)" :key="group.groupName" class="ml-3">
              <p class="text-label-md font-medium text-on-surface-variant">{{ group.groupName }}</p>
              <ul>
                <li
                  v-for="(modifier, modifierIndex) in group.options"
                  :key="modifierIndex"
                  class="flex items-center justify-between gap-3 text-label-md text-on-surface-variant"
                >
                  <span class="min-w-0">• {{ modifier.name }}</span>
                  <span v-if="modifierPrice(modifier.price_delta)" class="shrink-0 tabular-nums">{{ modifierPrice(modifier.price_delta) }}</span>
                </li>
              </ul>
            </div>

            <p v-if="item.note" class="mt-1 rounded-md bg-surface-container-highest px-2.5 py-1.5 text-label-md text-on-surface">
              <span class="font-medium">{{ t('tableDrawer.orders.detail.itemNote') }}:</span> {{ item.note }}
            </p>
          </li>
        </ul>

        <div v-if="orderDetail.customer_note" class="rounded-lg bg-surface-container-highest p-3">
          <p class="text-label-md font-medium text-on-surface-variant">{{ t('tableDrawer.orders.detail.orderNote') }}</p>
          <p class="mt-1 text-body-md text-on-surface">{{ orderDetail.customer_note }}</p>
        </div>

        <div class="flex flex-col gap-1 border-t border-outline-variant pt-3 text-body-md text-on-surface-variant">
          <div class="flex items-center justify-between gap-3">
            <span>{{ t('tableDrawer.orders.detail.subtotal') }}</span>
            <span class="tabular-nums">{{ formatMoney(orderDetail.subtotal, locale, currency) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span>{{ t('tableDrawer.orders.detail.extras') }}</span>
            <span class="tabular-nums">{{ formatMoney(orderDetail.modifiers_total, locale, currency) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 text-title-md font-semibold text-on-surface">
            <span>{{ t('tableDrawer.orders.detail.total') }}</span>
            <span class="tabular-nums">{{ formatMoney(orderDetail.total, locale, currency) }}</span>
          </div>
        </div>

        <div v-if="orderDetail.status === 'ready' && canServe" class="flex flex-col items-start gap-1.5">
          <AButton
            variant="tonal"
            :loading="servingId === orderDetail.id"
            :disabled="servingId !== null && servingId !== orderDetail.id"
            @click="markServed(orderDetail)"
          >
            <template #leading>
              <PhCheckCircle :size="18" />
            </template>
            {{ t('tableDrawer.orders.actions.markServed') }}
          </AButton>
          <p v-if="serveError[orderDetail.id]" class="text-label-md text-error" role="alert">
            {{ describeApiError(serveError[orderDetail.id]!, t) }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
