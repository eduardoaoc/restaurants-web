<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhHourglassMedium } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import PublicBottomSheet from './PublicBottomSheet.vue'
import type { PublicOrderCreated } from '@/types/public-menu'
import { formatMoney } from '@/utils/format'

/**
 * Post-submit confirmation (Passo 3.1 §21) — the message shown is driven
 * strictly by the real `order.status` the backend returned, never a guess:
 * `waiting_approval` (RestaurantSettings.customer_order_requires_approval
 * is on) gets the "waiting for confirmation" copy; anything else (the
 * order auto-confirmed straight to the kitchen) gets the "sent to the
 * kitchen" copy. Never says "confirmado"/"aceptado" for a
 * waiting_approval order.
 */
const props = defineProps<{
  order: PublicOrderCreated
  locale: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const isWaitingApproval = computed(() => props.order.status === 'waiting_approval')
</script>

<template>
  <PublicBottomSheet :label="t('publicMenu.confirmation.title')" @close="emit('close')">
    <div class="flex flex-col items-center gap-3 py-4 text-center">
      <span
        class="flex h-14 w-14 items-center justify-center rounded-full"
        :class="isWaitingApproval ? 'bg-secondary-container text-on-secondary-container' : 'bg-success-container text-on-success-container'"
      >
        <PhHourglassMedium v-if="isWaitingApproval" :size="28" aria-hidden="true" />
        <PhCheckCircle v-else :size="28" aria-hidden="true" />
      </span>
      <div>
        <p class="text-title-lg font-semibold text-on-surface">{{ t('publicMenu.confirmation.title') }}</p>
        <p class="mt-1 text-body-md text-on-surface-variant">
          {{ isWaitingApproval ? t('publicMenu.confirmation.waitingApproval') : t('publicMenu.confirmation.sentToKitchen') }}
        </p>
      </div>
      <p class="text-label-lg font-medium text-on-surface-variant">
        {{ t('publicMenu.confirmation.orderNumber', { number: order.order_number }) }}
      </p>
      <p class="text-title-md font-semibold tabular-nums text-on-surface">{{ formatMoney(order.total, locale) }}</p>
    </div>

    <template #footer>
      <AButton full-width @click="emit('close')">{{ t('publicMenu.confirmation.newOrder') }}</AButton>
    </template>
  </PublicBottomSheet>
</template>
