<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { NUTRITION_FIELDS, type NutritionDraft, type NutritionDraftErrors } from '@/utils/nutrition-draft'

/**
 * "Información nutricional" (Carta 4.2 §9-12) — a secondary, collapsible
 * card so 5 optional fields never dominate the product form (§10). Fully
 * controlled: `open` lives in the parent (`ProductForm`) so it can force
 * this open when a server-side `nutrition.*` error comes back, exactly
 * like the existing "Opciones avanzadas" disclosure already does for
 * `internal_name`.
 */
defineProps<{
  open: boolean
  modelValue: NutritionDraft
  errors: NutritionDraftErrors
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'update:modelValue': [NutritionDraft]
}>()

const { t } = useI18n()

function setField(field: (typeof NUTRITION_FIELDS)[number], value: string, current: NutritionDraft): void {
  emit('update:modelValue', { ...current, [field]: value })
}
</script>

<template>
  <ASurface tone="low" radius="lg" bordered class="overflow-hidden">
    <button
      type="button"
      class="flex w-full min-h-11 items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-expanded="open"
      @click="emit('update:open', !open)"
    >
      <span>
        <span class="block text-title-md font-medium text-on-surface">{{ t('menu.products.nutrition.title') }}</span>
        <span class="block text-label-md text-on-surface-variant">{{ t('menu.products.nutrition.subtitle') }}</span>
      </span>
      <PhCaretDown v-if="open" :size="18" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
      <PhCaretRight v-else :size="18" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
    </button>

    <div v-if="open" class="grid grid-cols-1 gap-4 border-t border-outline-variant p-4 sm:grid-cols-2 lg:grid-cols-3">
      <ATextField
        :model-value="modelValue.calories_kcal"
        :label="t('menu.products.nutrition.caloriesLabel')"
        inputmode="decimal"
        :error="errors.calories_kcal"
        :disabled="disabled"
        @update:model-value="(value) => setField('calories_kcal', value, modelValue)"
      />
      <ATextField
        :model-value="modelValue.protein_g"
        :label="t('menu.products.nutrition.proteinLabel')"
        inputmode="decimal"
        :error="errors.protein_g"
        :disabled="disabled"
        @update:model-value="(value) => setField('protein_g', value, modelValue)"
      />
      <ATextField
        :model-value="modelValue.carbohydrates_g"
        :label="t('menu.products.nutrition.carbohydratesLabel')"
        inputmode="decimal"
        :error="errors.carbohydrates_g"
        :disabled="disabled"
        @update:model-value="(value) => setField('carbohydrates_g', value, modelValue)"
      />
      <ATextField
        :model-value="modelValue.fat_g"
        :label="t('menu.products.nutrition.fatLabel')"
        inputmode="decimal"
        :error="errors.fat_g"
        :disabled="disabled"
        @update:model-value="(value) => setField('fat_g', value, modelValue)"
      />
      <ATextField
        :model-value="modelValue.salt_g"
        :label="t('menu.products.nutrition.saltLabel')"
        inputmode="decimal"
        :error="errors.salt_g"
        :disabled="disabled"
        @update:model-value="(value) => setField('salt_g', value, modelValue)"
      />
    </div>
  </ASurface>
</template>
