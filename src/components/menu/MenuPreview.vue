<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhCheckCircle, PhEye, PhPauseCircle } from '@phosphor-icons/vue'

import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useCategoryProducts } from '@/composables/useCategoryProducts'
import { useRestaurantCategories } from '@/composables/useRestaurantCategories'
import { useRestaurantStore } from '@/stores/restaurant'
import type { AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedDescription, resolveTranslatedName } from '@/utils/translation'
import type { CategoryProduct } from '@/types/category-product'

const props = defineProps<{
  enabled: boolean
  primaryLocale: AppLocale
}>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

// A fully independent fetch from CategoryList's own (CLAUDE.md §11: no
// cross-section store, every section owns its data) — this is a read-only
// admin view, never wired to createCategory/move/attach/detach.
const { categories, loading: categoriesLoading, error: categoriesError } = useRestaurantCategories(() => props.enabled)
const { productsByCategory, loadingByCategory } = useCategoryProducts(() => categories.value, () => props.enabled)

const currency = computed(() => restaurantStore.currentSettings?.currency)

function categoryName(category: (typeof categories.value)[number]): string {
  return resolveTranslatedName(category.translations, [locale.value, props.primaryLocale], category.slug)
}

function productName(cp: CategoryProduct): string {
  const product = cp.restaurant_product?.product
  if (!product) return `#${cp.restaurant_product_id}`
  return resolveTranslatedName(product.translations, [locale.value, props.primaryLocale], product.internal_name)
}

function productDescription(cp: CategoryProduct): string | null {
  const product = cp.restaurant_product?.product
  if (!product) return null
  return resolveTranslatedDescription(product.translations, [locale.value, props.primaryLocale])
}

const anyLoading = computed(() => categoriesLoading.value || categories.value.some((c) => loadingByCategory[c.id]))
</script>

<template>
  <div class="flex flex-col gap-4">
    <ASurface tone="container" radius="lg" bordered class="flex items-start gap-3 p-4">
      <PhEye :size="20" class="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
      <div>
        <p class="text-title-md font-medium text-on-surface">{{ t('menu.preview.bannerTitle') }}</p>
        <p class="mt-0.5 text-body-md text-on-surface-variant">{{ t('menu.preview.bannerSubtitle') }}</p>
      </div>
    </ASurface>

    <div v-if="categoriesLoading" class="flex items-center justify-center py-16">
      <AProgress />
    </div>

    <ASurface
      v-else-if="categoriesError"
      tone="container"
      radius="lg"
      role="alert"
      class="border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">{{ describeApiError(categoriesError, t) }}</p>
    </ASurface>

    <ASurface v-else-if="categories.length === 0" tone="container" radius="lg" bordered class="p-6">
      <p class="text-body-md text-on-surface-variant">{{ t('menu.preview.empty') }}</p>
    </ASurface>

    <template v-else>
      <ASurface v-for="category in categories" :key="category.id" tone="container" radius="lg" bordered class="p-4">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-title-lg font-semibold text-on-surface">{{ categoryName(category) }}</h3>
          <span
            v-if="category.status === 'inactive'"
            class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-label-md font-medium text-on-surface-variant"
          >
            <PhPauseCircle :size="14" aria-hidden="true" />
            {{ t('menu.status.inactive') }}
          </span>
        </div>

        <div v-if="loadingByCategory[category.id] && !anyLoading" class="flex justify-center py-4">
          <AProgress size="sm" />
        </div>

        <p v-else-if="(productsByCategory[category.id] ?? []).length === 0" class="mt-2 text-body-md text-on-surface-variant">
          {{ t('menu.categoryProducts.empty') }}
        </p>

        <ul v-else class="mt-3 flex flex-col divide-y divide-outline-variant">
          <li v-for="cp in productsByCategory[category.id]" :key="cp.id" class="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div class="min-w-0">
              <p class="text-body-lg font-medium text-on-surface">{{ productName(cp) }}</p>
              <p v-if="productDescription(cp)" class="mt-0.5 text-body-md text-on-surface-variant">{{ productDescription(cp) }}</p>
              <span
                v-if="cp.restaurant_product?.product?.status === 'inactive'"
                class="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-label-md text-on-surface-variant"
              >
                <PhArchive :size="12" aria-hidden="true" />
                {{ t('menu.products.archivedBadge') }}
              </span>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <span class="text-body-lg font-semibold tabular-nums text-on-surface">
                {{ cp.restaurant_product ? formatMoney(cp.restaurant_product.price, locale, currency) : '' }}
              </span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-md font-medium"
                :class="cp.restaurant_product?.available ? 'bg-success-container text-on-success-container' : 'bg-surface-container-highest text-on-surface-variant'"
              >
                <PhCheckCircle v-if="cp.restaurant_product?.available" :size="12" aria-hidden="true" />
                <PhPauseCircle v-else :size="12" aria-hidden="true" />
                {{ cp.restaurant_product?.available ? t('menu.products.available') : t('menu.products.unavailable') }}
              </span>
            </div>
          </li>
        </ul>
      </ASurface>
    </template>
  </div>
</template>
