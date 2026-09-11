<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { type AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { parsePriceInput } from '@/utils/price'
import { populateTranslationDraftMap, type TranslationDraftMap } from '@/utils/translation-draft'
import type {
  CreateProductPayload,
  Product,
  ProductStatus,
  ProductTranslationInput,
  RestaurantProduct,
  UpdateProductPayload,
} from '@/types/product'
import TranslationEditor from './TranslationEditor.vue'

const props = defineProps<{
  mode: 'create' | 'edit'
  product?: Product
  restaurantProduct?: RestaurantProduct
  primaryLocale: AppLocale
  saving: boolean
  /** Validation/business errors from the Product-side call (internal_name, sku, translations). */
  productError: ApiError | null
  /** Validation/business errors from the RestaurantProduct-side call (price, available). */
  restaurantProductError: ApiError | null
}>()

const emit = defineEmits<{
  save: [{ product: CreateProductPayload | UpdateProductPayload; restaurantProduct: { price: number; available: boolean } }]
  cancel: []
}>()

const { t } = useI18n()

const translations = ref<TranslationDraftMap>(populateTranslationDraftMap(props.product?.translations ?? []))
const sku = ref(props.product?.sku ?? '')
const status = ref<ProductStatus>(props.product?.status ?? 'active')
const priceRaw = ref(props.restaurantProduct?.price ?? '')
const available = ref(props.restaurantProduct?.available ?? true)

// internal_name is a backend bookkeeping field the owner shouldn't have to
// think about (CLAUDE.md §12) — auto-mirrors the primary-locale name while
// creating, unless the owner deliberately opens "Opciones avanzadas" and
// edits it. Never auto-rewritten in edit mode (same reasoning as Category's
// slug: an existing product's internal_name may already be relied on
// elsewhere, e.g. matched against SKU exports).
const internalName = ref(props.product?.internal_name ?? '')
const internalNameTouched = ref(props.mode === 'edit')
const advancedOpen = ref(false)

watch(
  () => translations.value[props.primaryLocale]?.name,
  (name) => {
    if (props.mode === 'create' && !internalNameTouched.value) {
      internalName.value = name ?? ''
    }
  },
)

function onInternalNameInput(value: string): void {
  internalNameTouched.value = true
  internalName.value = value
}

const primaryNameError = ref<string | null>(null)
const priceError = ref<string | null>(null)

watch(
  () => props.productError,
  (error) => {
    if (error?.kind === 'validation' && error.fieldErrors?.internal_name) {
      advancedOpen.value = true
    }
  },
)

watch(
  () => props.restaurantProductError,
  (error) => {
    if (error?.kind === 'validation' && error.fieldErrors?.price) {
      priceError.value = error.fieldErrors.price[0] ?? null
    }
  },
)

const submitLabel = computed(() => (props.mode === 'create' ? t('menu.products.addProduct') : t('menu.products.save')))

const bannerMessage = computed(() => {
  const relevant = props.productError ?? props.restaurantProductError
  if (!relevant) return null
  if (relevant.kind === 'validation' && (relevant.fieldErrors?.internal_name || relevant.fieldErrors?.price)) return null
  return describeApiError(relevant, t)
})

function submit(): void {
  const primaryName = translations.value[props.primaryLocale]?.name.trim() ?? ''
  if (!primaryName) {
    primaryNameError.value = t('menu.products.errors.nameRequired')
    return
  }
  primaryNameError.value = null

  const parsedPrice = parsePriceInput(priceRaw.value)
  if (parsedPrice === null) {
    priceError.value = t('menu.products.errors.priceInvalid')
    return
  }
  priceError.value = null

  const translationPayload: ProductTranslationInput[] = (Object.keys(translations.value) as AppLocale[])
    .map((locale) => ({ locale, draft: translations.value[locale] }))
    .filter(({ draft }) => draft.name.trim().length > 0)
    .map(({ locale, draft }) => ({
      locale,
      name: draft.name.trim(),
      description: draft.description.trim() ? draft.description.trim() : null,
    }))

  const finalInternalName = internalName.value.trim() || primaryName
  const finalSku = sku.value.trim() ? sku.value.trim() : null

  const productPayload: CreateProductPayload | UpdateProductPayload =
    props.mode === 'create'
      ? { internal_name: finalInternalName, sku: finalSku, translations: translationPayload }
      : { internal_name: finalInternalName, sku: finalSku, status: status.value, translations: translationPayload }

  emit('save', {
    product: productPayload,
    restaurantProduct: { price: parsedPrice, available: available.value },
  })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <TranslationEditor
      v-model="translations"
      :primary-locale="primaryLocale"
      :disabled="saving"
      :primary-name-error="primaryNameError ?? undefined"
    />

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ATextField
        :model-value="priceRaw"
        :label="t('menu.products.priceLabel')"
        inputmode="decimal"
        :error="priceError ?? undefined"
        :disabled="saving"
        required
        @update:model-value="(value) => { priceRaw = value; priceError = null }"
      >
        <template #leading>€</template>
      </ATextField>

      <div>
        <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.products.availableLabel') }}</span>
        <div
          class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
          role="radiogroup"
          :aria-label="t('menu.products.availableLabel')"
        >
          <button
            type="button"
            role="radio"
            :aria-checked="available"
            class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="available ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
            :disabled="saving"
            @click="available = true"
          >
            {{ t('menu.products.available') }}
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="!available"
            class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="!available ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
            :disabled="saving"
            @click="available = false"
          >
            {{ t('menu.products.unavailable') }}
          </button>
        </div>
      </div>
    </div>

    <div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-label-lg font-medium text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <PhCaretDown v-if="advancedOpen" :size="16" />
        <PhCaretRight v-else :size="16" />
        {{ t('menu.products.advancedToggle') }}
      </button>

      <div v-if="advancedOpen" class="mt-3 flex flex-col gap-4">
        <ATextField
          :model-value="internalName"
          :label="t('menu.products.internalNameLabel')"
          :help-text="t('menu.products.internalNameHelp')"
          :error="productError?.kind === 'validation' ? productError.fieldErrors?.internal_name?.[0] : undefined"
          :disabled="saving"
          @update:model-value="onInternalNameInput"
        />
        <ATextField
          :model-value="sku"
          :label="t('menu.products.skuLabel')"
          :error="productError?.kind === 'validation' ? productError.fieldErrors?.sku?.[0] : undefined"
          :disabled="saving"
          @update:model-value="(value) => (sku = value)"
        />

        <div v-if="mode === 'edit'">
          <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.products.catalogStatusLabel') }}</span>
          <p class="mt-0.5 text-label-md text-on-surface-variant">{{ t('menu.products.catalogStatusHint') }}</p>
          <div
            class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
            role="radiogroup"
            :aria-label="t('menu.products.catalogStatusLabel')"
          >
            <button
              type="button"
              role="radio"
              :aria-checked="status === 'active'"
              class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="status === 'active' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
              :disabled="saving"
              @click="status = 'active'"
            >
              {{ t('menu.status.active') }}
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="status === 'inactive'"
              class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="status === 'inactive' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
              :disabled="saving"
              @click="status = 'inactive'"
            >
              {{ t('menu.status.inactive') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>

    <div class="flex items-center gap-2">
      <AButton type="submit" :loading="saving">{{ submitLabel }}</AButton>
      <AButton variant="text" type="button" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </div>
  </form>
</template>
