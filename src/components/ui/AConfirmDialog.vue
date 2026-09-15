<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'

/**
 * The one shared "confirm this sensitive action" dialog (Passo 3.4 §8/§12) —
 * payment recording and closing a table both need the same shape (name the
 * exact consequence, one explicit confirm button, never a bare "are you
 * sure?"). Built on ABottomSheet, so Escape/focus-trap/backdrop-click and
 * light/dark theming are inherited for free rather than reimplemented per
 * caller (CLAUDE.md §17 reuse-first).
 */
withDefaults(
  defineProps<{
    label: string
    message: string
    confirmLabel: string
    loading?: boolean
  }>(),
  { loading: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
</script>

<template>
  <ABottomSheet :label="label" @close="emit('cancel')">
    <p class="text-body-lg text-on-surface">{{ message }}</p>

    <template #footer>
      <div class="flex gap-3">
        <AButton variant="outlined" class="flex-1" :disabled="loading" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </AButton>
        <AButton class="flex-1" :loading="loading" @click="emit('confirm')">
          {{ confirmLabel }}
        </AButton>
      </div>
    </template>
  </ABottomSheet>
</template>
