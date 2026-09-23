<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { ProductMediaSet } from '@/types/product-media'
import type { ProductMediaSlotDraft } from '@/utils/product-media'
import ProductMediaSlot from './ProductMediaSlot.vue'

/**
 * "Contenido visual" (Carta 4.3 §2-4) — video first, image second, since
 * the future Carta/Reels prioritizes video over image when both exist.
 * Purely a layout/composition wrapper around two `ProductMediaSlot`s; all
 * the real per-slot state/logic lives there (Carta 4.3 §9).
 */
defineProps<{
  media: ProductMediaSet
  videoDraft: ProductMediaSlotDraft
  imageDraft: ProductMediaSlotDraft
  disabled?: boolean
  saving?: boolean
  videoError?: string | null
  imageError?: string | null
}>()

const emit = defineEmits<{
  'update:videoDraft': [ProductMediaSlotDraft]
  'update:imageDraft': [ProductMediaSlotDraft]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <span class="text-title-md font-medium text-on-surface">{{ t('menu.products.media.title') }}</span>
      <p class="mt-0.5 text-label-md text-on-surface-variant">{{ t('menu.products.media.subtitle') }}</p>
    </div>

    <ProductMediaSlot
      type="video"
      :label="t('menu.products.media.videoLabel')"
      :hint="t('menu.products.media.videoHint')"
      :existing="media.video"
      :draft="videoDraft"
      :disabled="disabled"
      :saving="saving"
      :server-error="videoError"
      @update:draft="emit('update:videoDraft', $event)"
    />

    <ProductMediaSlot
      type="image"
      :label="t('menu.products.media.imageLabel')"
      :existing="media.image"
      :draft="imageDraft"
      :disabled="disabled"
      :saving="saving"
      :server-error="imageError"
      @update:draft="emit('update:imageDraft', $event)"
    />
  </div>
</template>
