<script setup lang="ts">
import { computed } from 'vue'

import AStarRating from '@/components/ui/AStarRating.vue'

/**
 * One rating screen of the guided feedback wizard (Carta 5.2 §18) — reused
 * for all four ratings (food/service/wait time/overall) so the question
 * heading, the 1-5 star control, and the discrete per-value microcopy
 * ("Muy mal" ... "Excelente") only exist in one place.
 *
 * `question` is the natural-language heading shown to the customer (e.g.
 * "¿Qué te pareció la comida?"); `ratingLabel` is the short field name
 * (e.g. "Comida") used as `AStarRating`'s own `<fieldset><legend>` so the
 * two never repeat the same sentence — the heading carries the question,
 * the legend names the control group for assistive tech.
 */
const props = defineProps<{
  modelValue: number
  question: string
  ratingLabel: string
  /** Exactly 5 entries, indexed by rating value 1-5 (index 0 = value 1). */
  valueLabels: string[]
}>()

defineEmits<{ 'update:modelValue': [number] }>()

const selectedLabel = computed(() => (props.modelValue > 0 ? props.valueLabels[props.modelValue - 1] : ''))
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-title-lg font-semibold text-on-surface">{{ question }}</h2>
    <AStarRating :model-value="modelValue" :label="ratingLabel" @update:model-value="$emit('update:modelValue', $event)" />
    <p class="min-h-6 text-label-lg text-on-surface-variant">{{ selectedLabel }}</p>
  </div>
</template>
