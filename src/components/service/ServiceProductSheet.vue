<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMinus, PhPlus } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { useProductModifierGroups } from '@/composables/useProductModifierGroups'
import type { StaffCartModifierSelection } from '@/composables/useStaffOrderCart'
import type { AppLocale } from '@/i18n'
import type { CategoryProduct } from '@/types/category-product'
import { resolveTranslatedDescription, resolveTranslatedName } from '@/utils/translation'
import { formatMoney } from '@/utils/format'

/**
 * Product detail + modifier selection + quantity for the WAITER's manual
 * order (Passo 3.2 §12/§13/§14) — mirrors PublicProductSheet's validation
 * rules (same real min_select/max_select/required semantics) but built
 * against the admin domain (CategoryProduct/ModifierGroup/ModifierOption,
 * translations[] resolved for display) instead of the Public* types, and
 * fetches modifier groups lazily — only for the ONE product being
 * configured, via the same useProductModifierGroups the admin Carta screen
 * already uses (Passo 2.5), never a bundled/public-shaped response.
 */
const props = defineProps<{
  categoryProduct: CategoryProduct
  primaryLocale: AppLocale
  currency: string
}>()

const emit = defineEmits<{
  close: []
  add: [payload: { quantity: number; selections: StaffCartModifierSelection[]; note: string | null }]
}>()

const { t, locale } = useI18n()

const restaurantProduct = computed(() => props.categoryProduct.restaurant_product)
const product = computed(() => restaurantProduct.value?.product ?? null)

const productName = computed(() =>
  product.value ? resolveTranslatedName(product.value.translations, [locale.value, props.primaryLocale], product.value.internal_name) : '',
)
const productDescription = computed(() =>
  product.value ? resolveTranslatedDescription(product.value.translations, [locale.value, props.primaryLocale]) : null,
)

const { groups, loading, optionsByGroup, optionsLoading } = useProductModifierGroups(
  () => props.categoryProduct.restaurant_product_id,
)

function groupName(groupId: number): string {
  const group = groups.value.find((g) => g.id === groupId)
  if (!group) return ''
  return resolveTranslatedName(group.translations, [locale.value, props.primaryLocale], group.internal_name)
}
function optionName(groupId: number, optionId: number): string {
  const option = (optionsByGroup[groupId] ?? []).find((o) => o.id === optionId)
  if (!option) return ''
  return resolveTranslatedName(option.translations, [locale.value, props.primaryLocale], option.internal_name)
}

const quantity = ref(1)
const note = ref('')
const selected = reactive<Record<number, number[]>>({})

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

// Never lets the waiter submit before every group's real min/max data has
// actually arrived — a group that's still fetching its options can't be
// validated yet, so it's treated as not-yet-satisfiable rather than
// trivially valid (Passo 3.2 §14 "validação antes de adicionar").
const allDataLoaded = computed(() => !loading.value && groups.value.every((g) => !optionsLoading[g.id]))

const groupsValid = computed(
  () =>
    allDataLoaded.value &&
    groups.value.every((group) => {
      const count = groupCount(group.id)
      return count >= group.min_select && count <= group.max_select
    }),
)

const selectedModifiers = computed<StaffCartModifierSelection[]>(() => {
  const result: StaffCartModifierSelection[] = []
  for (const group of groups.value) {
    for (const optionId of selected[group.id] ?? []) {
      const option = (optionsByGroup[group.id] ?? []).find((o) => o.id === optionId)
      if (!option) continue
      result.push({
        group_id: group.id,
        group_name: groupName(group.id),
        option_id: option.id,
        option_name: optionName(group.id, option.id),
        price_delta: option.price_delta,
      })
    }
  }
  return result
})

const basePrice = computed(() => restaurantProduct.value?.price ?? '0')
const unitPriceWithModifiers = computed(
  () => Number(basePrice.value) + selectedModifiers.value.reduce((sum, m) => sum + Number(m.price_delta), 0),
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
  <ABottomSheet :label="productName" @close="emit('close')">
    <div v-if="!restaurantProduct" class="py-6 text-center text-body-md text-on-surface-variant">
      {{ t('service.order.productUnavailable') }}
    </div>
    <div v-else class="flex flex-col gap-5">
      <div>
        <p v-if="productDescription" class="text-body-md text-on-surface-variant">{{ productDescription }}</p>
        <p class="mt-1 text-title-md font-semibold text-on-surface">{{ formatMoney(basePrice, locale, currency) }}</p>
      </div>

      <div v-if="loading" class="flex justify-center py-4">
        <AProgress size="sm" />
      </div>

      <fieldset v-for="group in groups" :key="group.id" class="flex flex-col gap-2">
        <legend class="flex items-center gap-2 text-label-lg font-semibold text-on-surface">
          {{ groupName(group.id) }}
          <span
            v-if="group.required"
            class="rounded-full bg-secondary-container px-2 py-0.5 text-label-md font-medium text-on-secondary-container"
          >
            {{ t('publicMenu.product.requiredBadge') }}
          </span>
        </legend>
        <p class="text-label-md text-on-surface-variant">{{ groupHint(group.min_select, group.max_select) }}</p>

        <AProgress v-if="optionsLoading[group.id]" size="sm" />
        <div v-else class="flex flex-col divide-y divide-outline-variant rounded-lg border border-outline-variant">
          <label
            v-for="option in optionsByGroup[group.id] ?? []"
            :key="option.id"
            class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2.5"
          >
            <span class="flex items-center gap-3">
              <input
                v-if="group.max_select === 1"
                type="radio"
                :name="`service-group-${group.id}`"
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
              <span class="text-body-lg text-on-surface">{{ optionName(group.id, option.id) }}</span>
            </span>
            <span v-if="Number(option.price_delta) > 0" class="shrink-0 text-label-lg text-on-surface-variant">
              +{{ formatMoney(option.price_delta, locale, currency) }}
            </span>
          </label>
        </div>
      </fieldset>

      <div class="flex flex-col gap-1.5">
        <label for="service-product-note" class="text-label-lg font-medium text-on-surface-variant">
          {{ t('publicMenu.product.note') }}
        </label>
        <textarea
          id="service-product-note"
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
      <AButton full-width :disabled="!restaurantProduct || !groupsValid" @click="submit">
        {{ t('publicMenu.product.addWithPrice', { price: formatMoney(String(totalPrice), locale, currency) }) }}
      </AButton>
    </template>
  </ABottomSheet>
</template>
