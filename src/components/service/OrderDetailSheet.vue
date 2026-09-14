<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhX } from '@phosphor-icons/vue'

import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AButton from '@/components/ui/AButton.vue'
import type { ApiError } from '@/api/errors'
import type { Order } from '@/types/orders'
import { describeApiError } from '@/utils/error-message'
import { formatDuration, formatMoney } from '@/utils/format'

/**
 * Pending-approval order detail (Passo 3.2 §9/§10/§11) — every price,
 * quantity, modifier and note is the exact backend snapshot, nothing
 * re-derived. No technical ids shown (only order_number/table name).
 * Reject requires an explicit second confirmation step (§11 "evitar clique
 * acidental") — approve doesn't, since it's the expected/common path and
 * the backend remains the real gate either way.
 */
const props = defineProps<{
  order: Order
  currency: string
  approving: boolean
  rejecting: boolean
  actionError: ApiError | null
}>()

const emit = defineEmits<{ close: []; approve: []; reject: [] }>()

const { t, locale } = useI18n()

const confirmingReject = ref(false)

const ageSeconds = computed(() => Math.max(0, Math.floor((Date.now() - new Date(props.order.created_at).getTime()) / 1000)))

function requestReject(): void {
  confirmingReject.value = true
}
function cancelReject(): void {
  confirmingReject.value = false
}
function confirmReject(): void {
  confirmingReject.value = false
  emit('reject')
}
</script>

<template>
  <ABottomSheet :label="order.order_number" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-title-md font-semibold text-on-surface">{{ order.table.name }}</p>
          <p class="text-label-md text-on-surface-variant">{{ t('service.order.waitingSince', { age: formatDuration(ageSeconds) }) }}</p>
        </div>
      </div>

      <ul class="flex flex-col divide-y divide-outline-variant">
        <li v-for="(item, index) in order.items" :key="index" class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
          <div class="flex items-start justify-between gap-3">
            <p class="text-body-lg font-medium text-on-surface">{{ item.quantity }}× {{ item.name }}</p>
            <p class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
              {{ formatMoney(item.line_total, locale, currency) }}
            </p>
          </div>
          <p v-if="item.modifiers.length > 0" class="text-label-md text-on-surface-variant">
            {{ item.modifiers.map((m) => m.name).join(', ') }}
          </p>
        </li>
      </ul>

      <p v-if="order.customer_note" class="rounded-lg bg-surface-container-highest p-3 text-body-md text-on-surface-variant">
        {{ order.customer_note }}
      </p>

      <div class="flex items-center justify-between border-t border-outline-variant pt-3 text-title-md font-semibold text-on-surface">
        <span>{{ t('publicMenu.cart.total') }}</span>
        <span class="tabular-nums">{{ formatMoney(order.total, locale, currency) }}</span>
      </div>

      <p v-if="actionError" class="rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
        {{ describeApiError(actionError, t) }}
      </p>
    </div>

    <!--
      Real gap found in the /ui-ux-pro-max review: the reject-confirmation
      step used to render inside the scrollable body, away from the Aprobar/
      Rechazar buttons the waiter's thumb is already on — in a busy dining
      room that's an easy way to tap "Rechazar" and see nothing happen where
      you're looking. The confirmation now REPLACES the same footer buttons
      in place instead (§11 "evitar clique acidental" done without moving
      the interaction away from the point of contact).
    -->
    <template #footer>
      <div v-if="confirmingReject" class="flex flex-col gap-3">
        <p class="text-body-md text-on-surface">{{ t('service.order.confirmRejectMessage') }}</p>
        <div class="flex gap-3">
          <AButton variant="outlined" class="flex-1" @click="cancelReject">{{ t('common.cancel') }}</AButton>
          <AButton variant="filled" class="flex-1" :loading="rejecting" @click="confirmReject">
            {{ t('service.order.confirmRejectAction') }}
          </AButton>
        </div>
      </div>
      <div v-else class="flex gap-3">
        <AButton variant="outlined" class="flex-1" :disabled="approving" :loading="rejecting" @click="requestReject">
          <template #leading><PhX :size="16" /></template>
          {{ t('service.order.reject') }}
        </AButton>
        <AButton class="flex-1" :disabled="rejecting" :loading="approving" @click="emit('approve')">
          <template #leading><PhCheck :size="16" /></template>
          {{ t('service.order.approve') }}
        </AButton>
      </div>
    </template>
  </ABottomSheet>
</template>
