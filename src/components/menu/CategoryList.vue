<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useRestaurantCategories } from '@/composables/useRestaurantCategories'
import type { AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import type { CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'
import CategoryEmptyState from './CategoryEmptyState.vue'
import CategoryForm from './CategoryForm.vue'
import CategoryRow from './CategoryRow.vue'

const props = defineProps<{
  enabled: boolean
  canManage: boolean
  primaryLocale: AppLocale
}>()

const { t } = useI18n()

const { categories, loading, error, saving, saveError, reordering, reorderError, createCategory, updateCategory, move } =
  useRestaurantCategories(() => props.enabled)

const showCreateForm = ref(false)

async function onCreate(payload: CreateCategoryPayload | UpdateCategoryPayload): Promise<void> {
  const err = await createCategory(payload as CreateCategoryPayload)
  if (!err) showCreateForm.value = false
}

function onUpdate(categoryId: number, payload: UpdateCategoryPayload) {
  return updateCategory(categoryId, payload)
}

function onMove(categoryId: number, direction: 'up' | 'down') {
  return move(categoryId, direction)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex items-center justify-center py-16">
      <AProgress />
    </div>

    <ASurface
      v-else-if="error"
      tone="container"
      radius="lg"
      role="alert"
      class="border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">{{ describeApiError(error, t) }}</p>
    </ASurface>

    <CategoryEmptyState
      v-else-if="categories.length === 0"
      :can-create="canManage"
      :primary-locale="primaryLocale"
      :saving="saving"
      :create-error="saveError"
      @create="onCreate"
    />

    <template v-else>
      <p v-if="reorderError" class="rounded-lg bg-error-container px-4 py-2.5 text-label-md text-on-error-container" role="alert">
        {{ t('menu.categories.errors.reorderFailed') }}
      </p>

      <div v-if="canManage">
        <AButton v-if="!showCreateForm" variant="tonal" @click="showCreateForm = true">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('menu.categories.empty.cta') }}
        </AButton>

        <ASurface v-else tone="container" radius="lg" bordered elevated class="p-4">
          <CategoryForm
            mode="create"
            :primary-locale="primaryLocale"
            :saving="saving"
            :error="saveError"
            @save="onCreate"
            @cancel="showCreateForm = false"
          />
        </ASurface>
      </div>

      <div class="flex flex-col gap-2">
        <CategoryRow
          v-for="(category, index) in categories"
          :key="category.id"
          :category="category"
          :can-edit="canManage"
          :primary-locale="primaryLocale"
          :is-first="index === 0"
          :is-last="index === categories.length - 1"
          :reordering="reordering"
          :on-save="(payload) => onUpdate(category.id, payload)"
          :on-move="(direction) => onMove(category.id, direction)"
        />
      </div>
    </template>
  </div>
</template>
