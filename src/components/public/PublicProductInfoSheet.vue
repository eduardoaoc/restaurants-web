<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import { ALLERGEN_ICON } from '@/utils/allergen-icons'
import { formatMoney, formatNumber } from '@/utils/format'
import type { PublicNutrition, PublicProduct } from '@/types/public-menu'

/**
 * Read-only product detail (Carta 4.5) — full description, price,
 * allergens, and nutrition (when the backend has it). Deliberately the
 * OTHER intent from `PublicProductSheet`: tapping the Reel media opens
 * this; nothing here ever touches modifiers, quantity, or the cart —
 * `request-add` only ever asks the parent to hand off to
 * `PublicProductSheet`, the same "reused mechanism" `openProduct` already
 * uses elsewhere, never a second purchase flow living in this component.
 *
 * No media rendered here on purpose (Carta 4.5 §5) — the Reel card behind
 * this sheet already has the exact same video/image mounted (this sheet
 * only ever opens for the active card), so repeating it here would just be
 * a second element requesting a URL the browser already has, for zero
 * informational gain over the card the customer just tapped.
 */
const props = defineProps<{
  product: PublicProduct
  locale: string
  orderingEnabled: boolean
}>()

const emit = defineEmits<{ close: []; 'request-add': [] }>()

const { t } = useI18n()

/**
 * Each row only ever appears if the backend actually sent that field
 * (Carta 4.2 "nutrição parcial" — never a 0 stand-in for a value that was
 * never cadastrado). If `nutrition` itself is null, or every field on it
 * happens to be null, this is simply empty and the whole section stays
 * hidden — never an empty "Información nutricional" heading over nothing.
 */
const nutritionRows = computed(() => {
  const nutrition = props.product.nutrition
  if (!nutrition) return []
  const fields: { key: keyof Omit<PublicNutrition, 'basis'>; label: string }[] = [
    { key: 'calories_kcal', label: 'publicMenu.product.nutrition.calories' },
    { key: 'protein_g', label: 'publicMenu.product.nutrition.protein' },
    { key: 'carbohydrates_g', label: 'publicMenu.product.nutrition.carbohydrates' },
    { key: 'fat_g', label: 'publicMenu.product.nutrition.fat' },
    { key: 'salt_g', label: 'publicMenu.product.nutrition.salt' },
  ]
  return fields
    .filter((field) => nutrition[field.key] !== null)
    .map((field) => ({ label: field.label, value: formatNumber(Number(nutrition[field.key]), props.locale) }))
})
</script>

<template>
  <ABottomSheet :label="product.name" @close="emit('close')">
    <div class="flex flex-col gap-5">
      <div>
        <p class="text-body-lg text-on-surface-variant">{{ product.description }}</p>
        <p class="mt-2 text-title-lg font-semibold text-on-surface">{{ formatMoney(product.price, locale) }}</p>
      </div>

      <div>
        <h3 class="mb-2 text-label-lg font-semibold text-on-surface">{{ t('publicMenu.product.allergensTitle') }}</h3>
        <div v-if="product.allergens.length > 0" class="flex flex-wrap gap-1.5">
          <span
            v-for="code in product.allergens"
            :key="code"
            class="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1.5 text-label-lg text-on-surface"
          >
            <component :is="ALLERGEN_ICON[code]" :size="16" aria-hidden="true" />
            {{ t(`menu.products.allergens.codes.${code}`) }}
          </span>
        </div>
        <p v-else class="text-body-md text-on-surface-variant">{{ t('publicMenu.feed.allergensNone') }}</p>
      </div>

      <div v-if="nutritionRows.length > 0">
        <h3 class="text-label-lg font-semibold text-on-surface">{{ t('publicMenu.product.nutrition.title') }}</h3>
        <p class="mb-2 text-label-md text-on-surface-variant">{{ t('publicMenu.product.nutrition.perServing') }}</p>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-outline-variant p-3">
          <template v-for="row in nutritionRows" :key="row.label">
            <dt class="text-label-md text-on-surface-variant">{{ t(row.label) }}</dt>
            <dd class="text-right text-body-lg font-medium tabular-nums text-on-surface">{{ row.value }}</dd>
          </template>
        </dl>
      </div>
    </div>

    <template v-if="orderingEnabled" #footer>
      <AButton full-width @click="emit('request-add')">
        {{ t('publicMenu.product.add') }}
      </AButton>
    </template>
  </ABottomSheet>
</template>
