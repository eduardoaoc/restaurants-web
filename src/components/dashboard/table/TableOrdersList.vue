<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhReceipt } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { ordersService } from '@/services/orders.service'
import type { Order } from '@/types/orders'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ tableSessionId: number; currency: string }>()

const { t, locale } = useI18n()
const orders = ref<Order[] | null>(null)
const error = ref<ApiError | null>(null)

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

onMounted(async () => {
  try {
    orders.value = await ordersService.list({ table_session_id: props.tableSessionId })
  } catch (err) {
    error.value = normalizeApiError(err)
  }
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="orders === null && !error" class="flex justify-center py-4">
      <AProgress size="sm" />
    </div>
    <p v-else-if="error" class="text-label-md text-error">{{ t('tableDrawer.orders.error') }}</p>
    <EmptyState v-else-if="orders && orders.length === 0" :icon="PhReceipt" :message="t('tableDrawer.orders.empty')" />
    <ul v-else-if="orders" class="flex flex-col divide-y divide-outline-variant">
      <li v-for="order in orders" :key="order.id" class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="truncate text-body-md font-medium text-on-surface">{{ order.order_number }}</p>
          <p class="text-label-md text-on-surface-variant">{{ statusLabel(order.status) }}</p>
        </div>
        <span class="shrink-0 text-body-md font-medium text-on-surface">{{ formatMoney(order.total, locale, currency) }}</span>
      </li>
    </ul>
  </div>
</template>
