<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedName } from '@/utils/translation'
import type { AppLocale } from '@/i18n'
import type { RestaurantProduct } from '@/types/product'

const props = defineProps<{
  /** Every RestaurantProduct of the current restaurant — the caller already excludes ones in THIS category. */
  pickable: RestaurantProduct[]
  loading: boolean
  primaryLocale: AppLocale
  attaching: boolean
  attachError: ApiError | null
}>()

const emit = defineEmits<{
  attach: [restaurantProductId: number]
  cancel: []
}>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const query = ref('')

function displayName(rp: RestaurantProduct): string {
  if (!rp.product) return `#${rp.product_id}`
  return resolveTranslatedName(rp.product.translations, [locale.value, props.primaryLocale], rp.product.internal_name)
}

const currency = computed(() => restaurantStore.currentSettings?.currency)

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.pickable

  return props.pickable.filter((rp) => {
    const name = displayName(rp)
    return name.toLowerCase().includes(needle) || (rp.product?.sku ?? '').toLowerCase().includes(needle)
  })
})

const bannerMessage = computed(() => {
  if (!props.attachError) return null
  if (props.attachError.kind === 'validation' && props.attachError.fieldErrors?.restaurant_product_id) {
    return t('menu.categoryProducts.errors.duplicateInCategory')
  }
  return describeApiError(props.attachError, t)
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="loading" class="flex items-center justify-center py-8">
      <AProgress />
    </div>

    <template v-else>
      <ATextField v-model="query" :label="t('menu.categoryProducts.searchLabel')" :placeholder="t('menu.categoryProducts.searchPlaceholder')">
        <template #leading><PhMagnifyingGlass :size="18" /></template>
      </ATextField>

      <p v-if="pickable.length === 0" class="text-body-md text-on-surface-variant">
        {{ t('menu.categoryProducts.noPickableProducts') }}
      </p>
      <p v-else-if="filtered.length === 0" class="text-body-md text-on-surface-variant">
        {{ t('menu.products.noResults') }}
      </p>

      <ul v-else class="flex max-h-72 flex-col gap-1 overflow-y-auto">
        <li v-for="rp in filtered" :key="rp.id" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-2 hover:bg-surface-container-high">
          <div class="min-w-0 flex-1">
            <p class="truncate text-body-lg text-on-surface">{{ displayName(rp) }}</p>
            <p class="truncate text-label-md text-on-surface-variant">{{ formatMoney(rp.price, locale, currency) }}</p>
          </div>
          <AButton variant="text" :loading="attaching" @click="emit('attach', rp.id)">
            <template #leading><PhPlus :size="16" /></template>
            {{ t('menu.categoryProducts.addToCategory') }}
          </AButton>
        </li>
      </ul>

      <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>

      <AButton variant="text" type="button" class="self-start" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </template>
  </div>
</template>
