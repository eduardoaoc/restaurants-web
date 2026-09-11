<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhSliders } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'

defineEmits<{ 'go-to-products': [] }>()

const { t } = useI18n()
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="max-w-xl p-6">
    <div class="flex items-center gap-2 text-on-surface">
      <PhSliders :size="18" class="text-on-surface-variant" aria-hidden="true" />
      <h3 class="text-title-md font-medium">{{ t('menu.sections.modifiers.title') }}</h3>
    </div>
    <p class="mt-1 text-body-md text-on-surface-variant">{{ t('menu.modifiers.overview.description') }}</p>
    <AButton class="mt-4" variant="tonal" @click="$emit('go-to-products')">
      {{ t('menu.modifiers.overview.cta') }}
    </AButton>
  </ASurface>
</template>
