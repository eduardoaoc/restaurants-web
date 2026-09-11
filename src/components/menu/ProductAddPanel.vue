<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhStorefront } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import type { AppLocale } from '@/i18n'
import type { CreateProductPayload, Product, UpdateProductPayload } from '@/types/product'
import ProductForm from './ProductForm.vue'
import ProductPicker from './ProductPicker.vue'

defineProps<{
  primaryLocale: AppLocale
  creating: boolean
  createError: ApiError | null
  attaching: boolean
  attachError: ApiError | null
  catalog: Product[]
  catalogLoading: boolean
  attachedProductIds: Set<number>
}>()

const emit = defineEmits<{
  create: [{ product: CreateProductPayload | UpdateProductPayload; restaurantProduct: { price: number; available: boolean } }]
  attach: [{ productId: number; price: number; available: boolean }]
  cancel: []
  'request-catalog': []
}>()

const { t } = useI18n()

const step = ref<'choose' | 'create' | 'reuse'>('choose')

function chooseCreate(): void {
  step.value = 'create'
}

function chooseReuse(): void {
  step.value = 'reuse'
  emit('request-catalog')
}

function backToChoose(): void {
  step.value = 'choose'
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="step === 'choose'">
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="flex flex-1 min-w-48 flex-col items-start gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-left transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="chooseCreate"
        >
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <PhPlus :size="18" aria-hidden="true" />
          </span>
          <span class="text-title-md font-medium text-on-surface">{{ t('menu.products.createNewOption') }}</span>
          <span class="text-label-md text-on-surface-variant">{{ t('menu.products.createNewOptionHint') }}</span>
        </button>

        <button
          type="button"
          class="flex flex-1 min-w-48 flex-col items-start gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-left transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="chooseReuse"
        >
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <PhStorefront :size="18" aria-hidden="true" />
          </span>
          <span class="text-title-md font-medium text-on-surface">{{ t('menu.products.reuseOption') }}</span>
          <span class="text-label-md text-on-surface-variant">{{ t('menu.products.reuseOptionHint') }}</span>
        </button>
      </div>

      <AButton variant="text" type="button" class="self-start" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </template>

    <ProductForm
      v-else-if="step === 'create'"
      mode="create"
      :primary-locale="primaryLocale"
      :saving="creating || attaching"
      :product-error="createError"
      :restaurant-product-error="attachError"
      @save="emit('create', $event)"
      @cancel="backToChoose"
    />

    <ProductPicker
      v-else
      :catalog="catalog"
      :attached-product-ids="attachedProductIds"
      :loading="catalogLoading"
      :primary-locale="primaryLocale"
      :attaching="attaching"
      :attach-error="attachError"
      @attach="emit('attach', $event)"
      @cancel="backToChoose"
    />
  </div>
</template>
