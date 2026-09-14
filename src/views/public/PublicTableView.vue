<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { PhGlobe, PhShoppingCart, PhWarningCircle } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import PublicCartSheet from '@/components/public/PublicCartSheet.vue'
import PublicOrderSuccess from '@/components/public/PublicOrderSuccess.vue'
import PublicProductSheet from '@/components/public/PublicProductSheet.vue'
import { usePublicCart, type CartModifierSelection } from '@/composables/usePublicCart'
import { usePublicMenu } from '@/composables/usePublicMenu'
import { publicTableService } from '@/services/public-table.service'
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, i18n, LOCALE_LABEL, type AppLocale } from '@/i18n'
import type { PublicOrderCreated, PublicProduct } from '@/types/public-menu'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

/**
 * The public QR customer surface (Passo 3.1) — top-level route component,
 * entirely outside AppShellLayout/the admin auth stack (see router/index.ts
 * `meta.public`). One instance per `publicToken` (keyed by the route in
 * PublicTableView's own parent — App.vue's RouterView), so a different
 * table always starts from a clean slate, never reusing another table's
 * in-memory state.
 */
const route = useRoute()
const publicToken = route.params.publicToken as string

const { t } = useI18n()

// Only ever set by the customer's own manual language pick (never by the
// admin's persisted `aforo-locale`, and never fed back from the first,
// locale-less load) — see usePublicMenu's own docblock for why re-feeding
// the resolved locale back in would cause a redundant second fetch.
const requestedLocale = ref<string | undefined>(undefined)
const { menu, loading, error, reload } = usePublicMenu(publicToken, requestedLocale)

/**
 * The restaurant's own `default_locale`/`enabled_locales` are real
 * `AVAILABLE_LOCALES`-shaped tags (unlike `PublicMenu.locale`'s own
 * example, which uses a short "es" form) — used as the single source of
 * truth for both the switcher and interface-chrome translation, so no
 * format mapping is ever needed.
 */
const currentLocale = computed<AppLocale>(() => {
  const requested = requestedLocale.value
  if (requested && (AVAILABLE_LOCALES as readonly string[]).includes(requested)) return requested as AppLocale
  const restaurantDefault = menu.value?.restaurant.default_locale
  if (restaurantDefault && (AVAILABLE_LOCALES as readonly string[]).includes(restaurantDefault)) {
    return restaurantDefault as AppLocale
  }
  return DEFAULT_LOCALE
})

const availableLocales = computed<AppLocale[]>(() => {
  const enabled = menu.value?.restaurant.enabled_locales ?? []
  return AVAILABLE_LOCALES.filter((loc) => enabled.includes(loc))
})

const showLanguageMenu = ref(false)

function selectLocale(loc: AppLocale): void {
  requestedLocale.value = loc
  showLanguageMenu.value = false
}

// Drives $t()/t() for this page's own chrome without ever touching the
// admin's persisted `aforo-locale` (Passo 3.1 §10/§27) — restored to
// whatever it was before on unmount, so a staff member returning to /app
// in the same tab after visiting a public link never sees their own
// language preference silently changed.
let previousGlobalLocale: AppLocale | null = null
onMounted(() => {
  previousGlobalLocale = i18n.global.locale.value
})
onBeforeUnmount(() => {
  if (previousGlobalLocale) i18n.global.locale.value = previousGlobalLocale
})
watch(currentLocale, (value) => (i18n.global.locale.value = value), { immediate: true })

const cart = usePublicCart(publicToken)

const selectedProduct = ref<PublicProduct | null>(null)
const showCart = ref(false)
const successOrder = ref<PublicOrderCreated | null>(null)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
let idempotencyKey: string | null = null

function openProduct(product: PublicProduct): void {
  selectedProduct.value = product
}

function onAddToCart(payload: { quantity: number; selections: CartModifierSelection[]; note: string | null }): void {
  if (!selectedProduct.value) return
  cart.addItem(selectedProduct.value, payload.quantity, payload.selections, payload.note)
  selectedProduct.value = null
}

async function confirmOrder(): Promise<void> {
  if (cart.lines.value.length === 0) return
  if (!idempotencyKey) idempotencyKey = crypto.randomUUID()

  submitting.value = true
  submitError.value = null
  try {
    const order = await publicTableService.createOrder(
      publicToken,
      { locale: currentLocale.value, items: cart.toOrderItems() },
      idempotencyKey,
    )
    cart.clear()
    idempotencyKey = null
    showCart.value = false
    successOrder.value = order
  } catch (err) {
    submitError.value = normalizeApiError(err)
  } finally {
    submitting.value = false
  }
}

function dismissSuccess(): void {
  successOrder.value = null
}

const restaurantName = computed(() => menu.value?.restaurant.name ?? '')
const tableLabel = computed(() => menu.value?.table.name ?? '')
</script>

<template>
  <div class="min-h-dvh bg-background pb-24">
    <header class="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-low/95 backdrop-blur">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-title-md font-semibold text-on-surface">{{ restaurantName || ' ' }}</p>
          <!-- Table.name already reads e.g. "Mesa 1" — never re-prefix it, that produced "Mesa Mesa 1". -->
          <p v-if="tableLabel" class="truncate text-label-lg text-on-surface-variant">{{ tableLabel }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <div v-if="availableLocales.length > 1" class="relative">
            <button
              type="button"
              class="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-label-lg font-medium text-on-surface-variant hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :aria-label="t('publicMenu.languageLabel')"
              :aria-expanded="showLanguageMenu"
              @click="showLanguageMenu = !showLanguageMenu"
            >
              <PhGlobe :size="20" />
            </button>
            <div
              v-if="showLanguageMenu"
              role="menu"
              :aria-label="t('publicMenu.languageLabel')"
              class="absolute right-0 z-20 mt-2 min-w-40 rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-elevated"
            >
              <button
                v-for="loc in availableLocales"
                :key="loc"
                type="button"
                role="menuitemradio"
                :aria-checked="currentLocale === loc"
                class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
                @click="selectLocale(loc)"
              >
                {{ LOCALE_LABEL[loc] }}
              </button>
            </div>
          </div>
          <ThemeSwitcher />
        </div>
      </div>

      <nav
        v-if="menu && menu.menu.categories.length > 0"
        class="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-3"
        :aria-label="t('common.menu')"
      >
        <a
          v-for="category in menu.menu.categories"
          :key="category.id"
          :href="`#public-category-${category.id}`"
          class="shrink-0 whitespace-nowrap rounded-full bg-surface-container px-4 py-2 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ category.name }}
        </a>
      </nav>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-4">
      <!-- Loading skeleton -->
      <div v-if="loading" class="flex flex-col gap-6" aria-hidden="true">
        <div class="flex gap-2">
          <div v-for="i in 3" :key="i" class="h-9 w-24 shrink-0 rounded-full bg-surface-container-high public-skeleton" />
        </div>
        <div v-for="i in 3" :key="i" class="flex flex-col gap-3">
          <div class="h-6 w-40 rounded bg-surface-container-high public-skeleton" />
          <div class="h-20 rounded-lg bg-surface-container-high public-skeleton" />
          <div class="h-20 rounded-lg bg-surface-container-high public-skeleton" />
        </div>
      </div>

      <!-- Hard error: token invalid, table/menu not found, rate limited, network, server -->
      <div v-else-if="error" class="flex flex-col items-center gap-4 py-16 text-center">
        <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
        <p class="max-w-xs text-body-lg text-on-surface-variant">
          {{ error.kind === 'not_found' ? t('publicMenu.errors.tableNotFound') : describeApiError(error, t) }}
        </p>
        <button
          type="button"
          class="min-h-11 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="reload"
        >
          {{ t('publicMenu.errors.retry') }}
        </button>
      </div>

      <!-- Menu explicitly not available for this table -->
      <div v-else-if="menu && menu.menu.categories.length === 0" class="py-10">
        <EmptyState :icon="PhWarningCircle" :message="t('publicMenu.emptyMenu')" />
      </div>

      <template v-else-if="menu">
        <section
          v-for="category in menu.menu.categories"
          :id="`public-category-${category.id}`"
          :key="category.id"
          class="scroll-mt-32 py-4 first:pt-0"
        >
          <h2 class="text-title-lg font-semibold text-on-surface">{{ category.name }}</h2>
          <p v-if="category.description" class="mt-1 text-body-md text-on-surface-variant">{{ category.description }}</p>

          <EmptyState
            v-if="category.products.length === 0"
            :icon="PhWarningCircle"
            :message="t('publicMenu.emptyCategoryProducts')"
          />

          <ul v-else class="mt-3 flex flex-col divide-y divide-outline-variant">
            <li v-for="product in category.products" :key="product.restaurant_product_id">
              <button
                type="button"
                class="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="openProduct(product)"
              >
                <div class="min-w-0">
                  <p class="text-body-lg font-medium text-on-surface">{{ product.name }}</p>
                  <p v-if="product.description" class="mt-0.5 line-clamp-2 text-body-md text-on-surface-variant">
                    {{ product.description }}
                  </p>
                </div>
                <span class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
                  {{ formatMoney(product.price, currentLocale) }}
                </span>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </main>

    <!-- Sticky cart CTA (Passo 3.1 §17) — safe-area aware, never covers content since the page has bottom padding to match. -->
    <div
      v-if="cart.lines.value.length > 0 && !loading && !error"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface-container-low px-4 pt-3"
      style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
      <button
        type="button"
        class="mx-auto flex min-h-11 w-full max-w-2xl items-center justify-between gap-3 rounded-full bg-primary px-5 py-3 text-label-lg font-medium text-on-primary hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="showCart = true"
      >
        <span class="flex items-center gap-2">
          <PhShoppingCart :size="20" />
          {{ t('publicMenu.cart.itemsCount', { count: cart.totalItems.value }) }}
        </span>
        <span class="tabular-nums">{{ formatMoney(String(cart.total.value), currentLocale) }}</span>
      </button>
    </div>

    <PublicProductSheet
      v-if="selectedProduct"
      :product="selectedProduct"
      :locale="currentLocale"
      @close="selectedProduct = null"
      @add="onAddToCart"
    />

    <PublicCartSheet
      v-if="showCart"
      :lines="cart.lines.value"
      :total="cart.total.value"
      :locale="currentLocale"
      :submitting="submitting"
      :submit-error="submitError"
      @close="showCart = false"
      @set-quantity="cart.setQuantity"
      @remove="cart.removeItem"
      @confirm="confirmOrder"
    />

    <PublicOrderSuccess v-if="successOrder" :order="successOrder" :locale="currentLocale" @close="dismissSuccess" />
  </div>
</template>

<style scoped>
.public-skeleton {
  animation: public-pulse 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .public-skeleton {
    animation: none;
  }
}
@keyframes public-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
