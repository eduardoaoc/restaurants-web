<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhForkKnife } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import type { AppLocale } from '@/i18n'
import type { CreateProductPayload, Product, UpdateProductPayload } from '@/types/product'
import ProductAddPanel from './ProductAddPanel.vue'

defineProps<{
  canCreate: boolean
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
  'request-catalog': []
}>()

const { t } = useI18n()

const showPanel = ref(false)
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="max-w-xl p-6">
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
        <PhForkKnife :size="22" aria-hidden="true" />
      </span>
      <div>
        <h3 class="text-title-lg font-semibold text-on-surface">{{ t('menu.products.empty.title') }}</h3>
        <p class="text-body-md text-on-surface-variant">{{ t('menu.products.empty.subtitle') }}</p>
      </div>
    </div>

    <p v-if="!canCreate" class="mt-5 text-body-md text-on-surface-variant">
      {{ t('menu.products.empty.noPermission') }}
    </p>

    <template v-else-if="!showPanel">
      <AButton class="mt-5" @click="showPanel = true">{{ t('menu.products.empty.cta') }}</AButton>
    </template>

    <div v-else class="mt-5">
      <ProductAddPanel
        :primary-locale="primaryLocale"
        :creating="creating"
        :create-error="createError"
        :attaching="attaching"
        :attach-error="attachError"
        :catalog="catalog"
        :catalog-loading="catalogLoading"
        :attached-product-ids="attachedProductIds"
        @create="emit('create', $event)"
        @attach="emit('attach', $event)"
        @cancel="showPanel = false"
        @request-catalog="emit('request-catalog')"
      />
    </div>
  </ASurface>
</template>
