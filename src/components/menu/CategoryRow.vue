<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowDown, PhArrowUp, PhCheckCircle, PhPauseCircle, PhPencilSimple, PhPlus } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import type { AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { resolveTranslatedName } from '@/utils/translation'
import type { Category, CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'
import type { CategoryProduct } from '@/types/category-product'
import type { RestaurantProduct } from '@/types/product'
import CategoryForm from './CategoryForm.vue'
import CategoryProductPicker from './CategoryProductPicker.vue'
import CategoryProductRow from './CategoryProductRow.vue'

const props = defineProps<{
  category: Category
  canEdit: boolean
  primaryLocale: AppLocale
  isFirst: boolean
  isLast: boolean
  reordering: boolean
  onSave: (payload: UpdateCategoryPayload) => Promise<ApiError | null>
  onMove: (direction: 'up' | 'down') => Promise<ApiError | null>

  /** Category <-> Product organization (CLAUDE.md Passo 2.6). */
  products: CategoryProduct[]
  productsLoading: boolean
  /** View/reorder/remove — gated on `manage_menu` (CategoryPolicy::update). */
  canOrganize: boolean
  /** Open the "Añadir productos" picker — gated on `manage_products`, since
   *  listing the restaurant's RestaurantProducts requires it even though
   *  the attach/detach/reorder endpoints themselves only need manage_menu
   *  (§27 — see useCategoryProducts.ts's own docblock for the full story). */
  canAttachProducts: boolean
  pickableProducts: RestaurantProduct[]
  pickableLoading: boolean
  productReordering: boolean
  attaching: boolean
  attachError: ApiError | null
  reorderError: ApiError | null
  detachError: ApiError | null
  isDetaching: (restaurantProductId: number) => boolean
  onMoveProduct: (categoryProductId: number, direction: 'up' | 'down') => Promise<ApiError | null>
  onDetachProduct: (restaurantProductId: number) => Promise<ApiError | null>
  onAttachProduct: (restaurantProductId: number) => Promise<ApiError | null>
}>()

const { t, locale } = useI18n()

const editing = ref(false)
const saving = ref(false)
const saveError = ref<ApiError | null>(null)

const quickToggling = ref(false)
const showAddProducts = ref(false)

const displayName = computed(() =>
  resolveTranslatedName(props.category.translations, [locale.value, props.primaryLocale], props.category.slug),
)

function startEditing(): void {
  saveError.value = null
  editing.value = true
}

async function onFormSave(payload: CreateCategoryPayload | UpdateCategoryPayload): Promise<void> {
  saving.value = true
  const error = await props.onSave(payload as UpdateCategoryPayload)
  saving.value = false

  if (!error) {
    editing.value = false
    return
  }
  saveError.value = error
}

async function toggleStatus(): Promise<void> {
  if (quickToggling.value) return
  quickToggling.value = true
  await props.onSave({ status: props.category.status === 'active' ? 'inactive' : 'active' })
  quickToggling.value = false
}

async function onAttachSelected(restaurantProductId: number): Promise<void> {
  const error = await props.onAttachProduct(restaurantProductId)
  if (!error) showAddProducts.value = false
}

const reorderErrorMessage = computed(() =>
  props.reorderError ? t('menu.categoryProducts.errors.reorderFailed') : null,
)
const detachErrorMessage = computed(() => (props.detachError ? describeApiError(props.detachError, t) : null))
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="p-4">
    <template v-if="!editing">
      <div class="flex items-start gap-3">
        <!-- 8px gap between the two 44px touch targets, not the tighter
             rhythm used elsewhere for same-purpose button pairs — two
             adjacent move actions are exactly the mis-tap case the 8px
             minimum spacing guideline exists for. -->
        <div class="flex shrink-0 flex-col gap-2">
          <AIconButton
            :label="t('menu.categories.moveUp')"
            :disabled="isFirst || reordering || !canEdit"
            @click="onMove('up')"
          >
            <PhArrowUp :size="16" />
          </AIconButton>
          <AIconButton
            :label="t('menu.categories.moveDown')"
            :disabled="isLast || reordering || !canEdit"
            @click="onMove('down')"
          >
            <PhArrowDown :size="16" />
          </AIconButton>
        </div>

        <!-- Name/chip and actions wrap independently onto their own line
             below ~400px — CLAUDE.md §26: never let a fixed-width action
             cluster squeeze the category name down to a couple of
             characters via `truncate` on a starved flex-1 column. -->
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-title-md font-medium text-on-surface">{{ displayName }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label-md font-medium"
                :class="category.status === 'active' ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface-variant'"
              >
                <PhCheckCircle v-if="category.status === 'active'" :size="14" aria-hidden="true" />
                <PhPauseCircle v-else :size="14" aria-hidden="true" />
                {{ category.status === 'active' ? t('menu.status.active') : t('menu.status.inactive') }}
              </span>
            </div>

            <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-1">
              <AButton variant="text" :loading="quickToggling" @click="toggleStatus">
                {{ category.status === 'active' ? t('menu.categories.deactivate') : t('menu.categories.activate') }}
              </AButton>
              <AButton variant="tonal" @click="startEditing">
                <template #leading><PhPencilSimple :size="16" /></template>
                {{ t('menu.categories.edit') }}
              </AButton>
            </div>
          </div>

          <!-- Products organized into this category (CLAUDE.md Passo 2.6 §5/§12) — always
               visible, never an extra accordion click, matching the Group->Option
               nesting precedent already proven in Modificadores (Passo 2.5). -->
          <div v-if="canOrganize" class="mt-4 flex flex-col gap-2">
            <div v-if="productsLoading" class="flex justify-center py-4">
              <AProgress size="sm" />
            </div>

            <template v-else>
              <CategoryProductRow
                v-for="(cp, index) in products"
                :key="cp.id"
                :category-product="cp"
                :can-edit="canOrganize"
                :primary-locale="primaryLocale"
                :is-first="index === 0"
                :is-last="index === products.length - 1"
                :reordering="productReordering"
                :detaching="isDetaching(cp.restaurant_product_id)"
                :on-move="(direction) => onMoveProduct(cp.id, direction)"
                :on-detach="() => onDetachProduct(cp.restaurant_product_id)"
              />

              <p v-if="products.length === 0 && !showAddProducts" class="py-2 text-body-md text-on-surface-variant">
                {{ t('menu.categoryProducts.empty') }}
              </p>
            </template>

            <p v-if="reorderErrorMessage" class="text-label-md text-error" role="alert">{{ reorderErrorMessage }}</p>
            <p v-if="detachErrorMessage" class="text-label-md text-error" role="alert">{{ detachErrorMessage }}</p>

            <template v-if="canAttachProducts">
              <AButton v-if="!showAddProducts" variant="text" class="self-start" @click="showAddProducts = true">
                <template #leading><PhPlus :size="14" /></template>
                {{ t('menu.categoryProducts.addProducts') }}
              </AButton>

              <ASurface v-else tone="high" radius="md" class="p-3">
                <CategoryProductPicker
                  :pickable="pickableProducts"
                  :loading="pickableLoading"
                  :primary-locale="primaryLocale"
                  :attaching="attaching"
                  :attach-error="attachError"
                  @attach="onAttachSelected"
                  @cancel="showAddProducts = false"
                />
              </ASurface>
            </template>
            <p v-else class="text-label-md text-on-surface-variant">{{ t('menu.categoryProducts.noAttachPermission') }}</p>
          </div>
        </div>
      </div>
    </template>

    <CategoryForm
      v-else
      mode="edit"
      :category="category"
      :primary-locale="primaryLocale"
      :saving="saving"
      :error="saveError"
      @save="onFormSave"
      @cancel="editing = false"
    />
  </ASurface>
</template>
