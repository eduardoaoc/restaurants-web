<script setup lang="ts">
import type { Component } from 'vue'

import ASurface from '@/components/ui/ASurface.vue'

defineProps<{
  icon: Component
  title: string
}>()
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="p-5">
    <div class="flex items-center gap-2 text-on-surface">
      <component :is="icon" :size="18" class="text-on-surface-variant" />
      <span class="text-title-md font-medium">{{ title }}</span>
    </div>
    <div class="mt-3">
      <slot />
    </div>
  </ASurface>
</template>
