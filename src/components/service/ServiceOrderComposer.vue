<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhShoppingCart, PhWarningCircle } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AProgress from '@/components/ui/AProgress.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import ServiceCartSheet from './ServiceCartSheet.vue'
import ServiceProductSheet from './ServiceProductSheet.vue'
import { useCategoryProducts } from '@/composables/useCategoryProducts'
import { useRestaurantCategories } from '@/composables/useRestaurantCategories'
import { useStaffOrderCart, type StaffCartModifierSelection } from '@/composables/useStaffOrderCart'
import { useRestaurantStore } from '@/stores/restaurant'
import { tablesService } from '@/services/tables.service'
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, type AppLocale } from '@/i18n'
import type { CategoryProduct } from '@/types/category-product'
import type { Order } from '@/types/orders'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedName } from '@/utils/translation'

/**
 * The waiter's manual-order flow (Passo 3.2 §12/§13) — reached from
 * TableDetailsDrawer's "Nuevo pedido" once a table has an active session.
 * Reuses the SAME real menu data source the admin Carta screens already
 * use (useRestaurantCategories/useCategoryProducts, Passo 2.3/2.6) — never
 * a second product-fetching system, and never the public/QR endpoints or
 * types (CLAUDE.md Passo 3.2 §13: "não usar endpoint público").
 */
const props = defineProps<{
  tableId: number
  tableName: string
  currency: string
}>()

const emit = defineEmits<{ close: []; created: [Order] }>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const primaryLocale = computed<AppLocale>(() => {
  const raw = restaurantStore.currentSettings?.default_locale
  return raw && (AVAILABLE_LOCALES as readonly string[]).includes(raw) ? (raw as AppLocale) : DEFAULT_LOCALE
})

const { categories, loading: categoriesLoading, error: categoriesError } = useRestaurantCategories(() => true)
const { productsByCategory, loadingByCategory } = useCategoryProducts(() => categories.value, () => true)

function categoryName(category: (typeof categories.value)[number]): string {
  return resolveTranslatedName(category.translations, [locale.value, primaryLocale.value], category.slug)
}
function productName(cp: CategoryProduct): string {
  const product = cp.restaurant_product?.product
  if (!product) return `#${cp.restaurant_product_id}`
  return resolveTranslatedName(product.translations, [locale.value, primaryLocale.value], product.internal_name)
}

const cart = useStaffOrderCart()
const selectedProduct = ref<CategoryProduct | null>(null)
const showCart = ref(false)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)

function openProduct(cp: CategoryProduct): void {
  if (!cp.restaurant_product?.available) return
  selectedProduct.value = cp
}

function onAddToCart(payload: { quantity: number; selections: StaffCartModifierSelection[]; note: string | null }): void {
  const rp = selectedProduct.value?.restaurant_product
  if (!rp) return
  cart.addItem({ restaurant_product_id: rp.id, name: productName(selectedProduct.value!), price: rp.price }, payload.quantity, payload.selections, payload.note)
  selectedProduct.value = null
}

async function confirmOrder(): Promise<void> {
  if (cart.lines.value.length === 0) return
  submitting.value = true
  submitError.value = null
  try {
    const order = await tablesService.createOrder(props.tableId, { items: cart.toOrderItems() })
    cart.clear()
    showCart.value = false
    emit('created', order)
  } catch (err) {
    submitError.value = normalizeApiError(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <ABottomSheet :label="t('service.order.newOrderFor', { table: tableName })" @close="emit('close')">
    <div v-if="categoriesLoading" class="flex justify-center py-8">
      <AProgress />
    </div>

    <p v-else-if="categoriesError" class="py-6 text-center text-body-md text-error" role="alert">
      {{ describeApiError(categoriesError, t) }}
    </p>

    <EmptyState v-else-if="categories.length === 0" :icon="PhWarningCircle" :message="t('service.order.noMenu')" />

    <div v-else class="flex flex-col gap-6">
      <section v-for="category in categories" :key="category.id">
        <h3 class="text-title-md font-semibold text-on-surface">{{ categoryName(category) }}</h3>

        <div v-if="loadingByCategory[category.id]" class="flex justify-center py-3">
          <AProgress size="sm" />
        </div>
        <p v-else-if="(productsByCategory[category.id] ?? []).length === 0" class="mt-2 text-body-md text-on-surface-variant">
          {{ t('service.order.noProductsInCategory') }}
        </p>

        <ul v-else class="mt-2 flex flex-col divide-y divide-outline-variant">
          <li v-for="cp in productsByCategory[category.id]" :key="cp.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.5]"
              :disabled="!cp.restaurant_product?.available"
              @click="openProduct(cp)"
            >
              <span class="min-w-0">
                <span class="block text-body-lg font-medium text-on-surface">{{ productName(cp) }}</span>
                <span v-if="!cp.restaurant_product?.available" class="text-label-md text-on-surface-variant">
                  {{ t('service.order.productUnavailable') }}
                </span>
              </span>
              <span v-if="cp.restaurant_product" class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
                {{ formatMoney(cp.restaurant_product.price, locale, currency) }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <template v-if="cart.lines.value.length > 0" #footer>
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-between gap-3 rounded-full bg-primary px-5 py-3 text-label-lg font-medium text-on-primary hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="showCart = true"
      >
        <span class="flex items-center gap-2">
          <PhShoppingCart :size="20" />
          {{ t('publicMenu.cart.itemsCount', { count: cart.totalItems.value }) }}
        </span>
        <span class="tabular-nums">{{ formatMoney(String(cart.total.value), locale, currency) }}</span>
      </button>
    </template>
  </ABottomSheet>

  <ServiceProductSheet
    v-if="selectedProduct"
    :category-product="selectedProduct"
    :primary-locale="primaryLocale"
    :currency="currency"
    @close="selectedProduct = null"
    @add="onAddToCart"
  />

  <ServiceCartSheet
    v-if="showCart"
    :table-name="tableName"
    :lines="cart.lines.value"
    :total="cart.total.value"
    :locale="locale"
    :currency="currency"
    :submitting="submitting"
    :submit-error="submitError"
    @close="showCart = false"
    @set-quantity="cart.setQuantity"
    @remove="cart.removeItem"
    @confirm="confirmOrder"
  />
</template>
