<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhCheckCircle, PhPauseCircle, PhPencilSimple, PhSliders } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedName } from '@/utils/translation'
import type { AppLocale } from '@/i18n'
import type {
  CreateProductPayload,
  RestaurantProduct,
  UpdateProductPayload,
  UpdateRestaurantProductPayload,
} from '@/types/product'
import ProductForm from './ProductForm.vue'

const props = defineProps<{
  restaurantProduct: RestaurantProduct
  canEdit: boolean
  primaryLocale: AppLocale
  onSaveProduct: (payload: UpdateProductPayload) => Promise<ApiError | null>
  onSaveRestaurantProduct: (payload: UpdateRestaurantProductPayload) => Promise<ApiError | null>
}>()

const emit = defineEmits<{ 'open-options': [RestaurantProduct] }>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const editing = ref(false)
const saving = ref(false)
const productSaveError = ref<ApiError | null>(null)
const restaurantProductSaveError = ref<ApiError | null>(null)

const quickToggling = ref(false)

const product = computed(() => props.restaurantProduct.product)

const displayName = computed(() => {
  if (!product.value) return `#${props.restaurantProduct.product_id}`
  return resolveTranslatedName(product.value.translations, [locale.value, props.primaryLocale], product.value.internal_name)
})

const currency = computed(() => restaurantStore.currentSettings?.currency)
const priceDisplay = computed(() => formatMoney(props.restaurantProduct.price, locale.value, currency.value))

const isArchived = computed(() => product.value?.status === 'inactive')

function startEditing(): void {
  productSaveError.value = null
  restaurantProductSaveError.value = null
  editing.value = true
}

async function onFormSave(payload: {
  product: CreateProductPayload | UpdateProductPayload
  restaurantProduct: { price: number; available: boolean }
}): Promise<void> {
  saving.value = true
  productSaveError.value = null
  restaurantProductSaveError.value = null

  // Both PATCH calls are idempotent (CLAUDE.md §20) — a retry after a
  // partial failure safely re-sends both, it never duplicates anything.
  const productError = await props.onSaveProduct(payload.product as UpdateProductPayload)
  if (productError) productSaveError.value = productError

  const restaurantError = await props.onSaveRestaurantProduct(payload.restaurantProduct)
  if (restaurantError) restaurantProductSaveError.value = restaurantError

  saving.value = false

  if (!productError && !restaurantError) {
    editing.value = false
  }
}

async function toggleAvailable(): Promise<void> {
  if (quickToggling.value) return
  quickToggling.value = true
  await props.onSaveRestaurantProduct({ available: !props.restaurantProduct.available })
  quickToggling.value = false
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="p-4">
    <template v-if="!editing">
      <div class="flex items-start gap-3">
        <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-title-md font-medium text-on-surface">{{ displayName }}</span>
              <span
                v-if="isArchived"
                class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-label-md font-medium text-on-surface-variant"
                :title="t('menu.products.catalogStatusHint')"
              >
                <PhArchive :size="14" aria-hidden="true" />
                {{ t('menu.products.archivedBadge') }}
              </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <span class="text-body-lg font-semibold tabular-nums text-on-surface">{{ priceDisplay }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label-md font-medium"
                :class="restaurantProduct.available ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface-variant'"
              >
                <PhCheckCircle v-if="restaurantProduct.available" :size="14" aria-hidden="true" />
                <PhPauseCircle v-else :size="14" aria-hidden="true" />
                {{ restaurantProduct.available ? t('menu.products.available') : t('menu.products.unavailable') }}
              </span>
              <span v-if="product?.sku" class="text-label-md text-on-surface-variant">{{ product.sku }}</span>
            </div>
          </div>

          <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-1">
            <AButton variant="text" :loading="quickToggling" @click="toggleAvailable">
              {{ restaurantProduct.available ? t('menu.products.markUnavailable') : t('menu.products.markAvailable') }}
            </AButton>
            <AButton variant="outlined" @click="emit('open-options', restaurantProduct)">
              <template #leading><PhSliders :size="16" /></template>
              {{ t('menu.products.options') }}
            </AButton>
            <AButton variant="tonal" @click="startEditing">
              <template #leading><PhPencilSimple :size="16" /></template>
              {{ t('menu.products.edit') }}
            </AButton>
          </div>
        </div>
      </div>
    </template>

    <ProductForm
      v-else
      mode="edit"
      :product="product ?? undefined"
      :restaurant-product="restaurantProduct"
      :primary-locale="primaryLocale"
      :saving="saving"
      :product-error="productSaveError"
      :restaurant-product-error="restaurantProductSaveError"
      @save="onFormSave"
      @cancel="editing = false"
    />
  </ASurface>
</template>
