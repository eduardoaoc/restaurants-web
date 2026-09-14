<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMinus, PhPlus } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import PublicBottomSheet from './PublicBottomSheet.vue'
import type { CartModifierSelection } from '@/composables/usePublicCart'
import type { PublicProduct } from '@/types/public-menu'
import { formatMoney } from '@/utils/format'

/**
 * Product detail + modifier selection + quantity (Passo 3.1 §13/§14).
 * Every min/max/required/multiple-selection rule is read straight off the
 * real backend contract (PublicModifierGroup) — nothing here is guessed:
 * `max_select === 1` renders as single-choice (radio), anything higher as
 * multi-choice (checkboxes) capped at `max_select`. The Add button stays
 * disabled until every group's selection count is within
 * [min_select, max_select] — CLAUDE.md's "validação deve existir ANTES de
 * adicionar ao carrinho", enforced here rather than only server-side.
 */
const props = defineProps<{
  product: PublicProduct
  locale: string
}>()

const emit = defineEmits<{
  close: []
  add: [payload: { quantity: number; selections: CartModifierSelection[]; note: string | null }]
}>()

const { t } = useI18n()

const quantity = ref(1)
const note = ref('')
/** groupId -> selected optionIds, in selection order (matters for a max_select=1 radio group's single value). */
const selected = reactive<Record<number, number[]>>({})

for (const group of props.product.modifier_groups) {
  selected[group.id] = []
}

function isSelected(groupId: number, optionId: number): boolean {
  return selected[groupId]?.includes(optionId) ?? false
}

function toggleSingle(groupId: number, optionId: number): void {
  selected[groupId] = [optionId]
}

function toggleMultiple(groupId: number, optionId: number, maxSelect: number): void {
  const current = selected[groupId] ?? []
  if (current.includes(optionId)) {
    selected[groupId] = current.filter((id) => id !== optionId)
    return
  }
  if (current.length >= maxSelect) return
  selected[groupId] = [...current, optionId]
}

function groupCount(groupId: number): number {
  return selected[groupId]?.length ?? 0
}

function groupHint(min: number, max: number): string {
  if (max === 1) return t('publicMenu.product.chooseOne')
  if (min === 0) return t('publicMenu.product.chooseUpTo', { max })
  return t('publicMenu.product.chooseBetween', { min, max })
}

const groupsValid = computed(() =>
  props.product.modifier_groups.every((group) => {
    const count = groupCount(group.id)
    return count >= group.min_select && count <= group.max_select
  }),
)

const selectedModifiers = computed<CartModifierSelection[]>(() => {
  const result: CartModifierSelection[] = []
  for (const group of props.product.modifier_groups) {
    for (const optionId of selected[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId)
      if (!option) continue
      result.push({
        group_id: group.id,
        group_name: group.name,
        option_id: option.id,
        option_name: option.name,
        price_delta: option.price_delta,
      })
    }
  }
  return result
})

const unitPriceWithModifiers = computed(
  () => Number(props.product.price) + selectedModifiers.value.reduce((sum, m) => sum + Number(m.price_delta), 0),
)
const totalPrice = computed(() => unitPriceWithModifiers.value * quantity.value)

function decrement(): void {
  quantity.value = Math.max(1, quantity.value - 1)
}
function increment(): void {
  quantity.value = Math.min(50, quantity.value + 1)
}

function submit(): void {
  if (!groupsValid.value) return
  emit('add', { quantity: quantity.value, selections: selectedModifiers.value, note: note.value.trim() || null })
}
</script>

<template>
  <PublicBottomSheet :label="product.name" @close="emit('close')">
    <div class="flex flex-col gap-5">
      <div>
        <p v-if="product.description" class="text-body-md text-on-surface-variant">{{ product.description }}</p>
        <p class="mt-1 text-title-md font-semibold text-on-surface">{{ formatMoney(product.price, locale) }}</p>
      </div>

      <fieldset v-for="group in product.modifier_groups" :key="group.id" class="flex flex-col gap-2">
        <legend class="flex items-center gap-2 text-label-lg font-semibold text-on-surface">
          {{ group.name }}
          <span
            v-if="group.required"
            class="rounded-full bg-secondary-container px-2 py-0.5 text-label-md font-medium text-on-secondary-container"
          >
            {{ t('publicMenu.product.requiredBadge') }}
          </span>
        </legend>
        <p v-if="group.description" class="text-label-md text-on-surface-variant">{{ group.description }}</p>
        <p class="text-label-md text-on-surface-variant">{{ groupHint(group.min_select, group.max_select) }}</p>

        <div class="flex flex-col divide-y divide-outline-variant rounded-lg border border-outline-variant">
          <label
            v-for="option in group.options"
            :key="option.id"
            class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2.5"
          >
            <span class="flex items-center gap-3">
              <input
                v-if="group.max_select === 1"
                type="radio"
                :name="`group-${group.id}`"
                :checked="isSelected(group.id, option.id)"
                class="h-5 w-5 text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @change="toggleSingle(group.id, option.id)"
              />
              <input
                v-else
                type="checkbox"
                :checked="isSelected(group.id, option.id)"
                :disabled="!isSelected(group.id, option.id) && groupCount(group.id) >= group.max_select"
                class="h-5 w-5 rounded border-outline text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
                @change="toggleMultiple(group.id, option.id, group.max_select)"
              />
              <span class="text-body-lg text-on-surface">{{ option.name }}</span>
            </span>
            <span v-if="Number(option.price_delta) > 0" class="shrink-0 text-label-lg text-on-surface-variant">
              +{{ formatMoney(option.price_delta, locale) }}
            </span>
          </label>
        </div>
      </fieldset>

      <div class="flex flex-col gap-1.5">
        <label :for="'product-note'" class="text-label-lg font-medium text-on-surface-variant">
          {{ t('publicMenu.product.note') }}
        </label>
        <textarea
          id="product-note"
          v-model="note"
          rows="2"
          :placeholder="t('publicMenu.product.notePlaceholder')"
          class="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>

      <div class="flex items-center justify-center gap-4">
        <button
          type="button"
          :aria-label="t('publicMenu.product.decrease')"
          class="flex h-11 w-11 items-center justify-center rounded-full border border-outline text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
          :disabled="quantity <= 1"
          @click="decrement"
        >
          <PhMinus :size="18" />
        </button>
        <span class="w-8 text-center text-title-lg font-semibold tabular-nums text-on-surface" aria-live="polite">
          {{ quantity }}
        </span>
        <button
          type="button"
          :aria-label="t('publicMenu.product.increase')"
          class="flex h-11 w-11 items-center justify-center rounded-full border border-outline text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
          :disabled="quantity >= 50"
          @click="increment"
        >
          <PhPlus :size="18" />
        </button>
      </div>
    </div>

    <template #footer>
      <AButton full-width :disabled="!groupsValid" @click="submit">
        {{ t('publicMenu.product.addWithPrice', { price: formatMoney(String(totalPrice), locale) }) }}
      </AButton>
    </template>
  </PublicBottomSheet>
</template>
