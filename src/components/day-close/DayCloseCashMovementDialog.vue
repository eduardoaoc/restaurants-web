<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import ATextField from '@/components/ui/ATextField.vue'
import type { ApiError } from '@/api/errors'
import type { CreateCashMovementPayload } from '@/types/cash-movement'
import { describeApiError } from '@/utils/error-message'

/** CARTA 9.1B §17/§18 — amount/reason only, matching the real POST contract exactly; nothing else is ever sent. */
const props = defineProps<{ type: 'pay_in' | 'pay_out'; submitting: boolean; error: ApiError | null }>()
const emit = defineEmits<{ submit: [CreateCashMovementPayload]; 'payload-changed': []; cancel: [] }>()

const { t } = useI18n()
const amount = ref('')
const reason = ref('')

// §18 — any edit to the payload invalidates the previous idempotency attempt.
watch([amount, reason], () => emit('payload-changed'))

function onSubmit(): void {
  if (!amount.value.trim() || !reason.value.trim()) return
  emit('submit', { type: props.type, amount: amount.value.trim(), reason: reason.value.trim() })
}
</script>

<template>
  <ABottomSheet :label="type === 'pay_in' ? t('dayClose.cash.movementDialogTitleIn') : t('dayClose.cash.movementDialogTitleOut')" @close="emit('cancel')">
    <div class="flex flex-col gap-4">
      <ATextField v-model="amount" :label="t('dayClose.cash.movementAmountLabel')" inputmode="decimal" required :disabled="submitting" />
      <ATextField
        v-model="reason"
        :label="t('dayClose.cash.movementReasonLabel')"
        :placeholder="t('dayClose.cash.movementReasonPlaceholder')"
        required
        :disabled="submitting"
      />
      <p v-if="error" class="text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>
    </div>

    <template #footer>
      <div class="flex gap-3">
        <AButton variant="outlined" class="flex-1" :disabled="submitting" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
        <AButton class="flex-1" :loading="submitting" :disabled="!amount.trim() || !reason.trim()" @click="onSubmit">
          {{ t('dayClose.cash.movementSubmit') }}
        </AButton>
      </div>
    </template>
  </ABottomSheet>
</template>
