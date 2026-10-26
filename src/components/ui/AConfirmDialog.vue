<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ADialog from '@/components/ui/ADialog.vue'

/** Compatibility wrapper: existing confirmation events and labels stay intact. */
withDefaults(
  defineProps<{
    label: string
    message: string
    confirmLabel: string
    loading?: boolean
    confirmVariant?: 'primary' | 'danger'
  }>(),
  { loading: false, confirmVariant: 'primary' },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
</script>

<template>
  <ADialog :title="label" @close="emit('cancel')">
    <p class="text-body-lg text-fg">{{ message }}</p>

    <template #footer>
      <div class="flex gap-3">
        <AButton variant="secondary" class="flex-1" :disabled="loading" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </AButton>
        <AButton :variant="confirmVariant" class="flex-1" :loading="loading" @click="emit('confirm')">
          {{ confirmLabel }}
        </AButton>
      </div>
    </template>
  </ADialog>
</template>
