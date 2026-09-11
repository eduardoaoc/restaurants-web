<script setup lang="ts">
import type { Component } from 'vue'

import ASurface from '@/components/ui/ASurface.vue'

defineProps<{
  icon: Component
  title: string
  description: string
  comingSoon: string
}>()
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="p-6">
    <div class="flex items-center gap-2 text-on-surface">
      <component :is="icon" :size="18" class="text-on-surface-variant" aria-hidden="true" />
      <h3 class="text-title-md font-medium">{{ title }}</h3>
    </div>
    <p class="mt-1 text-body-md text-on-surface-variant">{{ description }}</p>

    <div class="mt-5 flex flex-col items-center gap-2 rounded-lg border border-dashed border-outline-variant py-10 text-center text-on-surface-variant">
      <component :is="icon" :size="24" class="opacity-50" aria-hidden="true" />
      <p class="text-body-md">{{ comingSoon }}</p>
    </div>
  </ASurface>
</template>
