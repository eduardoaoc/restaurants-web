<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhArrowDown, PhArrowUp, PhCheckCircle, PhPauseCircle } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'
import AButton from '@/components/ui/AButton.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedName } from '@/utils/translation'
import type { AppLocale } from '@/i18n'
import type { CategoryProduct } from '@/types/category-product'

const props = defineProps<{
  categoryProduct: CategoryProduct
  canEdit: boolean
  primaryLocale: AppLocale
  isFirst: boolean
  isLast: boolean
  reordering: boolean
  detaching: boolean
  onMove: (direction: 'up' | 'down') => Promise<unknown>
  onDetach: () => Promise<unknown>
}>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const restaurantProduct = computed(() => props.categoryProduct.restaurant_product)
const product = computed(() => restaurantProduct.value?.product ?? null)

const displayName = computed(() => {
  if (!product.value) return `#${restaurantProduct.value?.product_id ?? props.categoryProduct.restaurant_product_id}`
  return resolveTranslatedName(product.value.translations, [locale.value, props.primaryLocale], product.value.internal_name)
})

const currency = computed(() => restaurantStore.currentSettings?.currency)
const priceDisplay = computed(() =>
  restaurantProduct.value ? formatMoney(restaurantProduct.value.price, locale.value, currency.value) : '',
)

const isArchived = computed(() => product.value?.status === 'inactive')
const isAvailable = computed(() => restaurantProduct.value?.available ?? false)
</script>

<template>
  <div class="flex items-center gap-2 rounded-lg bg-surface-container-high/60 p-3">
    <div v-if="canEdit" class="flex shrink-0 flex-col gap-1.5">
      <AIconButton :label="t('menu.categoryProducts.moveUp')" :disabled="isFirst || reordering" @click="onMove('up')">
        <PhArrowUp :size="14" />
      </AIconButton>
      <AIconButton :label="t('menu.categoryProducts.moveDown')" :disabled="isLast || reordering" @click="onMove('down')">
        <PhArrowDown :size="14" />
      </AIconButton>
    </div>

    <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-body-lg font-medium text-on-surface">{{ displayName }}</span>
          <span
            v-if="isArchived"
            class="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-label-md text-on-surface-variant"
            :title="t('menu.products.catalogStatusHint')"
          >
            <PhArchive :size="12" aria-hidden="true" />
            {{ t('menu.products.archivedBadge') }}
          </span>
        </div>
        <div class="mt-0.5 flex flex-wrap items-center gap-2">
          <span class="text-label-lg tabular-nums text-on-surface-variant">{{ priceDisplay }}</span>
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-md font-medium"
            :class="isAvailable ? 'bg-success-container text-on-success-container' : 'bg-surface-container-highest text-on-surface-variant'"
          >
            <PhCheckCircle v-if="isAvailable" :size="12" aria-hidden="true" />
            <PhPauseCircle v-else :size="12" aria-hidden="true" />
            {{ isAvailable ? t('menu.products.available') : t('menu.products.unavailable') }}
          </span>
        </div>
      </div>

      <AButton v-if="canEdit" variant="text" :loading="detaching" @click="onDetach">
        {{ t('menu.categoryProducts.removeFromCategory') }}
      </AButton>
    </div>
  </div>
</template>
