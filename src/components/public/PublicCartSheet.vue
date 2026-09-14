<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhMinus, PhPlus, PhTrash } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import PublicBottomSheet from './PublicBottomSheet.vue'
import type { ApiError } from '@/api/errors'
import type { CartLine } from '@/composables/usePublicCart'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

/**
 * The order review required before POST (Passo 3.1 §18) — every line,
 * quantity, modifier and price is shown here; confirming is the one
 * explicit, unambiguous action that actually sends the order.
 */
const props = defineProps<{
  lines: CartLine[]
  total: number
  locale: string
  submitting: boolean
  submitError: ApiError | null
}>()

const emit = defineEmits<{
  close: []
  setQuantity: [key: string, quantity: number]
  remove: [key: string]
  confirm: []
}>()

const { t } = useI18n()

function lineUnitTotal(line: CartLine): number {
  return Number(line.unit_price) + line.modifiers.reduce((sum, m) => sum + Number(m.price_delta), 0)
}
</script>

<template>
  <PublicBottomSheet :label="t('publicMenu.cart.title')" @close="emit('close')">
    <p v-if="lines.length === 0" class="py-8 text-center text-body-md text-on-surface-variant">
      {{ t('publicMenu.cart.empty') }}
    </p>

    <ul v-else class="flex flex-col divide-y divide-outline-variant">
      <li v-for="line in lines" :key="line.key" class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-body-lg font-medium text-on-surface">{{ line.name }}</p>
            <p v-if="line.modifiers.length > 0" class="mt-0.5 text-label-md text-on-surface-variant">
              {{ line.modifiers.map((m) => m.option_name).join(', ') }}
            </p>
            <p v-if="line.note" class="mt-0.5 text-label-md italic text-on-surface-variant">{{ line.note }}</p>
          </div>
          <p class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
            {{ formatMoney(String(lineUnitTotal(line) * line.quantity), locale) }}
          </p>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <button
              type="button"
              :aria-label="t('publicMenu.product.decrease')"
              class="flex h-9 w-9 items-center justify-center rounded-full border border-outline text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="emit('setQuantity', line.key, line.quantity - 1)"
            >
              <PhMinus :size="16" />
            </button>
            <span class="w-6 text-center text-body-lg font-medium tabular-nums text-on-surface">{{ line.quantity }}</span>
            <button
              type="button"
              :aria-label="t('publicMenu.product.increase')"
              class="flex h-9 w-9 items-center justify-center rounded-full border border-outline text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
              :disabled="line.quantity >= 50"
              @click="emit('setQuantity', line.key, line.quantity + 1)"
            >
              <PhPlus :size="16" />
            </button>
          </div>
          <button
            type="button"
            :aria-label="t('publicMenu.cart.remove')"
            class="flex h-9 w-9 items-center justify-center rounded-full text-error hover:bg-error-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="emit('remove', line.key)"
          >
            <PhTrash :size="16" />
          </button>
        </div>
      </li>
    </ul>

    <p v-if="submitError" class="mt-3 rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
      {{ describeApiError(submitError, t) }}
    </p>

    <template #footer>
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between text-title-md font-semibold text-on-surface">
          <span>{{ t('publicMenu.cart.total') }}</span>
          <span class="tabular-nums">{{ formatMoney(String(total), locale) }}</span>
        </div>
        <AButton full-width :disabled="lines.length === 0" :loading="submitting" @click="emit('confirm')">
          {{ submitting ? t('publicMenu.cart.confirming') : t('publicMenu.cart.confirm') }}
        </AButton>
      </div>
    </template>
  </PublicBottomSheet>
</template>
