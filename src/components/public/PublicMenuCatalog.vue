<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowLeft, PhMagnifyingGlass, PhPlayCircle, PhShoppingCart, PhWarningCircle } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'
import type { AppLocale } from '@/i18n'
import type { PublicCategory, PublicProduct } from '@/types/public-menu'
import { formatMoney } from '@/utils/format'
import { safeHttpUrl } from '@/utils/safe-url'
import PublicActionsMenu from './PublicActionsMenu.vue'
import PublicLanguageSwitcher from './PublicLanguageSwitcher.vue'

/**
 * The traditional carta — the new default landing screen once the customer
 * taps "Ver la carta" (replacing direct entry into the Reel). Visually
 * self-contained, but `searchQuery`/`selectedCategoryId` are CONTROLLED
 * props, not local state — `PublicTableView` owns them (same reason
 * `activeCategoryId` already lives there for the Reel, not inside
 * `PublicProductFeed`): `usePublicMenu`'s own `loading` flag flips true on
 * every locale switch, and the parent's `v-if="loading"` chain fully
 * unmounts/remounts whatever's inside `v-else` while that happens — a local
 * ref here would silently reset on every language switch, not just a trip
 * into the Reel and back. Lifting them up is what actually keeps them alive
 * across both.
 *
 * Deliberately never mounts a `<video>` element or fetches anything itself
 * — `categories` arrives fully loaded from `usePublicMenu` via the parent.
 * A product with a video only ever shows its still `image` (or the branded
 * fallback) plus a small play badge; tapping that thumbnail asks the parent
 * to open the Reel at that exact product (`open-reel`), it never renders
 * the video here.
 */
const props = defineProps<{
  restaurantName: string
  tableName: string
  locale: AppLocale
  /** Already filtered to categories with at least one product (`categoriesWithProducts`) — never re-filtered here. */
  categories: PublicCategory[]
  orderingEnabled: boolean
  cartCount: number
  cartTotal: number
  availableLocales: AppLocale[]
  currentLocale: AppLocale
  searchQuery: string
  selectedCategoryId: number | null
  showWaiterCall: boolean
  waiterCalled: boolean
  requestingWaiter: boolean
  showBillRequest: boolean
  billRequestConfirmed: boolean
  billRequestBlockedMessage: string | null
  requestingBill: boolean
  requestError: ApiError | null
  showFeedback: boolean
  feedbackAlreadySubmitted: boolean
  /** Read-only carta while the operational day is closed: there is no table visit to go back to. */
  hideBackToTable?: boolean
}>()

const emit = defineEmits<{
  'back-to-table': []
  'open-reel': [PublicProduct]
  'open-info': [PublicProduct]
  'open-cart': []
  'select-locale': [AppLocale]
  'call-waiter': []
  'request-bill': []
  'open-feedback': []
  'update:search-query': [string]
  'update:selected-category-id': [number | null]
}>()

const { t } = useI18n()

const searchQueryModel = computed({
  get: () => props.searchQuery,
  set: (value: string) => emit('update:search-query', value),
})

const totalItemCount = computed(() => props.categories.reduce((sum, category) => sum + category.products.length, 0))

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const filteredProducts = computed<PublicProduct[]>(() => {
  const base: PublicProduct[] =
    props.selectedCategoryId === null
      ? props.categories.flatMap((category) => category.products)
      : props.categories.find((category) => category.id === props.selectedCategoryId)?.products ?? []

  const query = normalize(props.searchQuery.trim())
  if (!query) return base

  return base.filter((product) => normalize(product.name).includes(query) || normalize(product.description).includes(query))
})

/** Never a real `<video>` element — only ever an `image`/fallback thumbnail (§7: mounting video for every row would preload dozens at once). */
function thumbnailUrl(product: PublicProduct): string | undefined {
  return safeHttpUrl(product.media.image?.url)
}
function hasVideo(product: PublicProduct): boolean {
  return Boolean(safeHttpUrl(product.media.video?.url))
}

const failedImageIds = ref(new Set<number>())
function onImageError(restaurantProductId: number): void {
  failedImageIds.value = new Set(failedImageIds.value).add(restaurantProductId)
}

/** Two distinct intents on the same row (§8): the thumbnail opens the Reel when there's a video to show, otherwise it falls back to the same info sheet the rest of the row already opens — never a dead tap target. */
function onThumbnailClick(product: PublicProduct): void {
  if (hasVideo(product)) emit('open-reel', product)
  else emit('open-info', product)
}
</script>

<template>
  <div class="relative flex h-full w-full flex-col bg-background text-on-surface">
    <div
      class="flex shrink-0 flex-col gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 pb-3"
      style="padding-top: max(0.75rem, env(safe-area-inset-top))"
    >
      <div class="flex items-center justify-between gap-2 pt-3">
        <button
          v-if="!hideBackToTable"
          type="button"
          class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-label-lg font-medium text-on-surface-variant transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="emit('back-to-table')"
        >
          <PhArrowLeft :size="18" aria-hidden="true" />
          {{ t('publicMenu.catalog.backToTable') }}
        </button>
        <span class="shrink-0 text-label-lg text-on-surface-variant">{{ t('publicMenu.catalog.itemCount', { count: totalItemCount }) }}</span>
      </div>

      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-title-md font-semibold text-on-surface">{{ restaurantName }}</p>
          <p v-if="tableName" class="truncate text-label-lg text-on-surface-variant">
            {{ t('publicMenu.catalog.tableSubtitle', { table: tableName }) }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <PublicLanguageSwitcher :available="availableLocales" :current="currentLocale" @select="emit('select-locale', $event)" />
          <ThemeSwitcher />
          <PublicActionsMenu
            :show-waiter-call="showWaiterCall"
            :waiter-called="waiterCalled"
            :requesting-waiter="requestingWaiter"
            :show-bill-request="showBillRequest"
            :bill-request-confirmed="billRequestConfirmed"
            :bill-request-blocked-message="billRequestBlockedMessage"
            :requesting-bill="requestingBill"
            :request-error="requestError"
            :show-feedback="showFeedback"
            :feedback-already-submitted="feedbackAlreadySubmitted"
            @call-waiter="emit('call-waiter')"
            @request-bill="emit('request-bill')"
            @open-feedback="emit('open-feedback')"
          />
        </div>
      </div>

      <label class="relative block">
        <span class="sr-only">{{ t('publicMenu.catalog.searchLabel') }}</span>
        <PhMagnifyingGlass :size="18" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
        <input
          v-model="searchQueryModel"
          type="search"
          :placeholder="t('publicMenu.catalog.searchPlaceholder')"
          class="w-full rounded-full border border-outline bg-surface-container-lowest py-2.5 pl-10 pr-4 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>

      <div
        v-if="categories.length > 1"
        class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        :aria-label="t('publicMenu.feed.categoryNavLabel')"
      >
        <button
          type="button"
          class="shrink-0 rounded-full px-4 py-2 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="
            selectedCategoryId === null
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
          "
          :aria-pressed="selectedCategoryId === null"
          @click="emit('update:selected-category-id', null)"
        >
          {{ t('publicMenu.catalog.all') }}
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="shrink-0 rounded-full px-4 py-2 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="
            selectedCategoryId === category.id
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
          "
          :aria-pressed="selectedCategoryId === category.id"
          @click="emit('update:selected-category-id', category.id)"
        >
          {{ category.name }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="filteredProducts.length === 0" class="px-4">
        <EmptyState
          :icon="PhWarningCircle"
          :message="searchQuery.trim() ? t('publicMenu.catalog.noResults') : t('publicMenu.emptyCategoryProducts')"
        />
      </div>

      <ul v-else class="flex flex-col divide-y divide-outline-variant px-4 pb-24">
        <li v-for="product in filteredProducts" :key="product.restaurant_product_id" class="flex items-stretch gap-3 py-3">
          <button
            type="button"
            class="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :aria-label="hasVideo(product) ? t('publicMenu.catalog.openReel', { name: product.name }) : t('publicMenu.product.viewDetails', { name: product.name })"
            @click="onThumbnailClick(product)"
          >
            <img
              v-if="thumbnailUrl(product) && !failedImageIds.has(product.restaurant_product_id)"
              :src="thumbnailUrl(product)"
              alt=""
              referrerpolicy="no-referrer"
              loading="lazy"
              class="absolute inset-0 h-full w-full object-cover"
              @error="onImageError(product.restaurant_product_id)"
            />
            <div v-else class="absolute inset-0 flex items-center justify-center" role="img" :aria-label="t('publicMenu.feed.noMediaAlt')">
              <img :src="aforoSymbol" alt="" aria-hidden="true" class="h-7 w-7 opacity-20" />
            </div>
            <span
              v-if="hasVideo(product)"
              aria-hidden="true"
              class="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white"
            >
              <PhPlayCircle :size="14" weight="fill" />
            </span>
          </button>

          <button
            type="button"
            class="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="emit('open-info', product)"
          >
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2 block text-body-lg font-medium text-on-surface">{{ product.name }}</span>
              <span v-if="product.description" class="line-clamp-2 block text-label-lg text-on-surface-variant">{{ product.description }}</span>
            </span>
            <span class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">{{ formatMoney(product.price, locale) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <button
      v-if="cartCount > 0"
      type="button"
      class="absolute right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-label-lg font-medium text-on-primary shadow-elevated hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      style="bottom: max(1.25rem, calc(1.25rem + env(safe-area-inset-bottom)))"
      @click="emit('open-cart')"
    >
      <PhShoppingCart :size="20" aria-hidden="true" />
      <span>{{ cartCount }}</span>
      <span class="tabular-nums">{{ formatMoney(String(cartTotal), locale) }}</span>
    </button>
  </div>
</template>
