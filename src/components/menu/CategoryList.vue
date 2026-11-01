<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowDown, PhArrowUp, PhPlus } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useCategoryProducts } from '@/composables/useCategoryProducts'
import { useRestaurantCategories } from '@/composables/useRestaurantCategories'
import { useRestaurantProducts } from '@/composables/useRestaurantProducts'
import type { AppLocale } from '@/i18n'
import { resolveTranslatedName } from '@/utils/translation'
import { describeApiError } from '@/utils/error-message'
import type { CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'
import CategoryEmptyState from './CategoryEmptyState.vue'
import CategoryForm from './CategoryForm.vue'
import CategoryRow from './CategoryRow.vue'

const props = defineProps<{
  enabled: boolean
  canManage: boolean
  /** Only relevant to the "Añadir productos" picker — see CategoryRow.vue's own docblock. */
  canManageProducts: boolean
  primaryLocale: AppLocale
}>()

const { t, locale } = useI18n()

const { categories, loading, error, saving, saveError, reordering, reorderError, createCategory, updateCategory, move } =
  useRestaurantCategories(() => props.enabled)

const {
  productsByCategory,
  loadingByCategory,
  attachingByCategory,
  attachErrorByCategory,
  reorderingByCategory,
  reorderErrorByCategory,
  detachErrorByCategory,
  isDetaching,
  attachProduct,
  detachProduct,
  moveProduct,
} = useCategoryProducts(() => categories.value, () => props.enabled)

// Only fetched at all once the owner can actually attach anything (manage_products) —
// a manage_menu-only user never triggers this call, so it never comes back 403
// (CLAUDE.md Passo 2.6 §27: GET /restaurants/{restaurant}/products itself requires
// manage_products, independent of the category-product endpoints' own manage_menu gate).
const { restaurantProducts, loading: restaurantProductsLoading } = useRestaurantProducts(
  () => props.enabled && props.canManageProducts,
)

function pickableFor(categoryId: number) {
  const inCategory = new Set((productsByCategory[categoryId] ?? []).map((cp) => cp.restaurant_product_id))
  return restaurantProducts.value.filter((rp) => !inCategory.has(rp.id))
}

const showCreateForm = ref(false)
const selectedCategoryId = ref<number | null>(null)
const selectedCategory = computed(() => categories.value.find(category => category.id === selectedCategoryId.value) ?? null)

watch(categories, (items) => {
  if (!items.some(item => item.id === selectedCategoryId.value)) selectedCategoryId.value = items[0]?.id ?? null
}, { immediate: true })

async function onCreate(payload: CreateCategoryPayload | UpdateCategoryPayload): Promise<void> {
  const err = await createCategory(payload as CreateCategoryPayload)
  if (!err) showCreateForm.value = false
}

function onUpdate(categoryId: number, payload: UpdateCategoryPayload) {
  return updateCategory(categoryId, payload)
}

function onMove(categoryId: number, direction: 'up' | 'down') {
  return move(categoryId, direction)
}

function isSelectedDetaching(restaurantProductId: number): boolean {
  return selectedCategory.value ? isDetaching(selectedCategory.value.id, restaurantProductId) : false
}
function moveSelectedProduct(categoryProductId: number, direction: 'up' | 'down') {
  return selectedCategory.value ? moveProduct(selectedCategory.value.id, categoryProductId, direction) : Promise.resolve(null)
}
function detachSelectedProduct(restaurantProductId: number) {
  return selectedCategory.value ? detachProduct(selectedCategory.value.id, restaurantProductId) : Promise.resolve(null)
}
function attachSelectedProduct(restaurantProductId: number) {
  return selectedCategory.value ? attachProduct(selectedCategory.value.id, restaurantProductId) : Promise.resolve(null)
}
function saveSelectedCategory(payload: UpdateCategoryPayload) {
  return selectedCategory.value ? onUpdate(selectedCategory.value.id, payload) : Promise.resolve(null)
}
function reorderSelectedCategory(direction: 'up' | 'down') {
  return selectedCategory.value ? onMove(selectedCategory.value.id, direction) : Promise.resolve(null)
}
</script>

<template>
  <div class="flex flex-col gap-4">
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

    <CategoryEmptyState
      v-else-if="categories.length === 0"
      :can-create="canManage"
      :primary-locale="primaryLocale"
      :saving="saving"
      :create-error="saveError"
      @create="onCreate"
    />

    <template v-else>
      <p v-if="reorderError" class="rounded-lg bg-error-container px-4 py-2.5 text-label-md text-on-error-container" role="alert">
        {{ t('menu.categories.errors.reorderFailed') }}
      </p>

      <div v-if="canManage">
        <AButton v-if="!showCreateForm" variant="tonal" @click="showCreateForm = true">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('menu.categories.empty.cta') }}
        </AButton>

        <ASurface v-else tone="container" radius="lg" bordered elevated class="p-4">
          <CategoryForm
            mode="create"
            :primary-locale="primaryLocale"
            :saving="saving"
            :error="saveError"
            @save="onCreate"
            @cancel="showCreateForm = false"
          />
        </ASurface>
      </div>

      <div class="menu-category-workspace">
        <ASurface tone="low" radius="lg" bordered class="menu-category-navigation p-3">
          <h2 class="px-2 pb-2 text-label-lg font-semibold text-on-surface-variant">{{ t('menu.sections.categories.title') }}</h2>
          <ul class="flex flex-col gap-1">
            <li v-for="(category, index) in categories" :key="category.id" class="flex min-w-0 items-center gap-1">
              <button type="button" class="min-h-11 min-w-0 flex-1 rounded-md px-3 text-left text-body-md transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" :class="selectedCategoryId === category.id ? 'bg-primary-container font-semibold text-on-primary-container' : 'text-on-surface-variant'" :aria-pressed="selectedCategoryId === category.id" @click="selectedCategoryId = category.id">
                <span class="block truncate">{{ resolveTranslatedName(category.translations, [locale, primaryLocale], category.slug) }}</span>
                <span class="mt-0.5 block text-label-md opacity-80">{{ (productsByCategory[category.id] ?? []).length }}</span>
              </button>
              <span v-if="canManage" class="flex shrink-0 flex-col gap-1">
                <AIconButton :label="t('menu.categories.moveUp')" :disabled="index === 0 || reordering" @click="onMove(category.id, 'up')"><PhArrowUp :size="14" /></AIconButton>
                <AIconButton :label="t('menu.categories.moveDown')" :disabled="index === categories.length - 1 || reordering" @click="onMove(category.id, 'down')"><PhArrowDown :size="14" /></AIconButton>
              </span>
            </li>
          </ul>
        </ASurface>

        <div class="min-w-0">
          <CategoryRow
            v-if="selectedCategory"
            :key="selectedCategory.id"
            :category="selectedCategory"
            :can-edit="canManage"
            :primary-locale="primaryLocale"
            :is-first="categories[0]?.id === selectedCategory.id"
            :is-last="categories.at(-1)?.id === selectedCategory.id"
            :reordering="reordering"
            :on-save="saveSelectedCategory"
            :on-move="reorderSelectedCategory"
            :products="productsByCategory[selectedCategory.id] ?? []"
            :products-loading="loadingByCategory[selectedCategory.id] ?? false"
            :can-organize="canManage"
            :can-attach-products="canManageProducts"
            :pickable-products="pickableFor(selectedCategory.id)"
            :pickable-loading="restaurantProductsLoading"
            :product-reordering="reorderingByCategory[selectedCategory.id] ?? false"
            :attaching="attachingByCategory[selectedCategory.id] ?? false"
            :attach-error="attachErrorByCategory[selectedCategory.id] ?? null"
            :reorder-error="reorderErrorByCategory[selectedCategory.id] ?? null"
            :detach-error="detachErrorByCategory[selectedCategory.id] ?? null"
            :is-detaching="isSelectedDetaching"
            :on-move-product="moveSelectedProduct"
            :on-detach-product="detachSelectedProduct"
            :on-attach-product="attachSelectedProduct"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.menu-category-workspace { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr); gap: calc(var(--spacing) * 3); }
.menu-category-navigation { min-width: 0; }
@media (min-width: 768px) { .menu-category-workspace { grid-template-columns: minmax(12rem, 0.32fr) minmax(0, 1fr); align-items: start; } .menu-category-navigation { position: sticky; top: calc(var(--bar-top, 0px) + var(--spacing) * 4); max-height: calc(100dvh - var(--bar-top, 0px) - var(--spacing) * 8); overflow-y: auto; } }
</style>
