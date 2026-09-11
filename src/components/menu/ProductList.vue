<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useRestaurantProducts } from '@/composables/useRestaurantProducts'
import { useRestaurantStore } from '@/stores/restaurant'
import type { AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import type { CreateProductPayload, RestaurantProduct, UpdateProductPayload } from '@/types/product'
import ProductAddPanel from './ProductAddPanel.vue'
import ProductEmptyState from './ProductEmptyState.vue'
import ProductModifiersView from './ProductModifiersView.vue'
import ProductRow from './ProductRow.vue'

const props = defineProps<{
  enabled: boolean
  canManage: boolean
  primaryLocale: AppLocale
}>()

const { t } = useI18n()
const restaurantStore = useRestaurantStore()

const {
  restaurantProducts,
  loading,
  error,
  catalog,
  catalogLoading,
  loadCatalog,
  pendingProduct,
  creating,
  createError,
  attaching,
  attachError,
  createProduct,
  attachProduct,
  resetAddState,
  updateProduct,
  updateRestaurantProduct,
} = useRestaurantProducts(() => props.enabled)

const attachedProductIds = computed(() => new Set(restaurantProducts.value.map((rp) => rp.product_id)))

const showAddPanel = ref(false)

// Modifiers are entered from a specific product (CLAUDE.md Passo 2.5 §5) —
// a full unmount/remount of ProductModifiersView between two different
// products (never switching its restaurantProductId prop in place) is what
// guarantees no modifier state from A can ever appear while configuring B
// (§28): the owner always goes through "Volver" first, so a fresh
// composable instance is created on every open. A restaurant switch closes
// this contextual selection outright (§29) — RestaurantProduct only makes
// sense within the restaurant it was loaded from.
const selectedRestaurantProduct = ref<RestaurantProduct | null>(null)

watch(
  () => restaurantStore.currentRestaurantId,
  () => {
    selectedRestaurantProduct.value = null
  },
)

function onOpenOptions(restaurantProduct: RestaurantProduct): void {
  selectedRestaurantProduct.value = restaurantProduct
}

function onBackFromOptions(): void {
  selectedRestaurantProduct.value = null
}

async function onCreate(payload: { product: CreateProductPayload | UpdateProductPayload; restaurantProduct: { price: number; available: boolean } }): Promise<void> {
  // Two independent backend calls (CLAUDE.md §10/§33) — if a Product was
  // already created by a previous attempt (pendingProduct set from a prior
  // attach failure), never create a second one, only retry the attach.
  let productId = pendingProduct.value?.id ?? null

  if (productId === null) {
    const createErr = await createProduct(payload.product as CreateProductPayload)
    if (createErr) return
    productId = pendingProduct.value?.id ?? null
  }

  if (productId === null) return

  const attachErr = await attachProduct(productId, payload.restaurantProduct)
  if (!attachErr) {
    showAddPanel.value = false
    resetAddState()
  }
}

async function onAttach(payload: { productId: number; price: number; available: boolean }): Promise<void> {
  const err = await attachProduct(payload.productId, { price: payload.price, available: payload.available })
  if (!err) {
    showAddPanel.value = false
    resetAddState()
  }
}

function onRequestCatalog(): void {
  void loadCatalog()
}

function onCancelAdd(): void {
  showAddPanel.value = false
  resetAddState()
}
</script>

<template>
  <ProductModifiersView
    v-if="selectedRestaurantProduct"
    :restaurant-product="selectedRestaurantProduct"
    :can-manage="canManage"
    :primary-locale="primaryLocale"
    @back="onBackFromOptions"
  />

  <div v-else class="flex flex-col gap-4">
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

    <ProductEmptyState
      v-else-if="restaurantProducts.length === 0"
      :can-create="canManage"
      :primary-locale="primaryLocale"
      :creating="creating"
      :create-error="createError"
      :attaching="attaching"
      :attach-error="attachError"
      :catalog="catalog"
      :catalog-loading="catalogLoading"
      :attached-product-ids="attachedProductIds"
      @create="onCreate"
      @attach="onAttach"
      @request-catalog="onRequestCatalog"
    />

    <template v-else>
      <div v-if="canManage">
        <AButton v-if="!showAddPanel" variant="tonal" @click="showAddPanel = true">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('menu.products.empty.cta') }}
        </AButton>

        <ASurface v-else tone="container" radius="lg" bordered elevated class="p-4">
          <ProductAddPanel
            :primary-locale="primaryLocale"
            :creating="creating"
            :create-error="createError"
            :attaching="attaching"
            :attach-error="attachError"
            :catalog="catalog"
            :catalog-loading="catalogLoading"
            :attached-product-ids="attachedProductIds"
            @create="onCreate"
            @attach="onAttach"
            @cancel="onCancelAdd"
            @request-catalog="onRequestCatalog"
          />
        </ASurface>
      </div>

      <div class="flex flex-col gap-2">
        <ProductRow
          v-for="rp in restaurantProducts"
          :key="rp.id"
          :restaurant-product="rp"
          :can-edit="canManage"
          :primary-locale="primaryLocale"
          :on-save-product="(payload) => updateProduct(rp.product_id, payload)"
          :on-save-restaurant-product="(payload) => updateRestaurantProduct(rp.id, payload)"
          @open-options="onOpenOptions"
        />
      </div>
    </template>
  </div>
</template>
