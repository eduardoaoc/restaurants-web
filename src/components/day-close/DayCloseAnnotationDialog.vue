<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import type { ApiError } from '@/api/errors'
import { describeApiError } from '@/utils/error-message'

/** CARTA 9.1B §39 — append-only post-close note; no edit/delete since the API exposes neither. */
const props = defineProps<{ submitting: boolean; error: ApiError | null }>()
const emit = defineEmits<{ submit: [string]; cancel: [] }>()

const { t } = useI18n()
const body = ref('')

function onSubmit(): void {
  if (!body.value.trim()) return
  emit('submit', body.value.trim())
}
</script>

<template>
  <ABottomSheet :label="t('dayClose.detail.annotationDialogTitle')" @close="emit('cancel')">
    <p class="text-label-md text-on-surface-variant">{{ t('dayClose.detail.annotationHelp') }}</p>
    <div class="mt-3 flex flex-col gap-1.5">
      <label for="annotation-body" class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.detail.annotationLabel') }}</label>
      <textarea
        id="annotation-body"
        v-model="body"
        rows="3"
        required
        :disabled="submitting"
        class="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
    </div>

    <p v-if="error" class="mt-3 text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>

    <template #footer>
      <div class="flex gap-3">
        <AButton variant="outlined" class="flex-1" :disabled="submitting" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
        <AButton class="flex-1" :loading="submitting" :disabled="!body.trim()" @click="onSubmit">{{ t('dayClose.detail.annotationSubmit') }}</AButton>
      </div>
    </template>
  </ABottomSheet>
</template>
