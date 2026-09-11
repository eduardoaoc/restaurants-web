<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhSquaresFour } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import type { AppLocale } from '@/i18n'
import type { CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'
import CategoryForm from './CategoryForm.vue'

defineProps<{
  canCreate: boolean
  primaryLocale: AppLocale
  saving: boolean
  createError: ApiError | null
}>()

const emit = defineEmits<{ create: [CreateCategoryPayload] }>()

const { t } = useI18n()

const showForm = ref(false)

function onSave(payload: CreateCategoryPayload | UpdateCategoryPayload): void {
  emit('create', payload as CreateCategoryPayload)
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="max-w-xl p-6">
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
        <PhSquaresFour :size="22" aria-hidden="true" />
      </span>
      <div>
        <h3 class="text-title-lg font-semibold text-on-surface">{{ t('menu.categories.empty.title') }}</h3>
        <p class="text-body-md text-on-surface-variant">{{ t('menu.categories.empty.subtitle') }}</p>
      </div>
    </div>

    <p v-if="!canCreate" class="mt-5 text-body-md text-on-surface-variant">
      {{ t('menu.categories.empty.noPermission') }}
    </p>

    <template v-else-if="!showForm">
      <AButton class="mt-5" @click="showForm = true">{{ t('menu.categories.empty.cta') }}</AButton>
    </template>

    <div v-else class="mt-5">
      <CategoryForm
        mode="create"
        :primary-locale="primaryLocale"
        :saving="saving"
        :error="createError"
        @save="onSave"
        @cancel="showForm = false"
      />
    </div>
  </ASurface>
</template>
