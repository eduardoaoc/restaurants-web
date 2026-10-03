<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import type { ApiError } from '@/api/errors'
import { describeApiError } from '@/utils/error-message'

/** CARTA 9.1B §9/§10 — the one explicit, confirmed action this screen ever takes on a session; never automatic. */
defineProps<{ submitting: boolean; error: ApiError | null }>()
const emit = defineEmits<{ confirm: [string | undefined]; cancel: [] }>()

const { t } = useI18n()
const reason = ref('')

function onConfirm(): void {
  emit('confirm', reason.value.trim() || undefined)
}
</script>

<template>
  <ABottomSheet :label="t('dayClose.status.voidDialogTitle')" @close="emit('cancel')">
    <p class="text-body-lg text-on-surface">{{ t('dayClose.status.voidDialogMessage') }}</p>

    <div class="mt-4 flex flex-col gap-1.5">
      <label for="void-reason" class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.status.voidReasonLabel') }}</label>
      <textarea
        id="void-reason"
        v-model="reason"
        rows="2"
        :disabled="submitting"
        class="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
      />
    </div>

    <p v-if="error" class="mt-3 text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>

    <template #footer>
      <div class="flex gap-3">
        <AButton variant="outlined" class="flex-1" :disabled="submitting" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
        <AButton class="flex-1" :loading="submitting" @click="onConfirm">{{ t('dayClose.status.voidConfirm') }}</AButton>
      </div>
    </template>
  </ABottomSheet>
</template>
