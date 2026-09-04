<script setup lang="ts">
import type { Component } from 'vue'

import ASurface from '@/components/ui/ASurface.vue'

withDefaults(
  defineProps<{
    icon: Component
    label: string
    value: string
    context?: string
    size?: 'display' | 'headline'
  }>(),
  { size: 'headline' },
)
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="p-5">
    <div class="flex items-center gap-2 text-on-surface-variant">
      <component :is="icon" :size="18" />
      <span class="text-label-lg">{{ label }}</span>
    </div>
    <div class="mt-2 flex items-end justify-between gap-3">
      <p :class="size === 'display' ? 'text-display' : 'text-headline'" class="font-semibold text-on-surface">
        {{ value }}
      </p>
      <slot />
    </div>
    <p v-if="context" class="mt-1 text-label-md text-on-surface-variant">{{ context }}</p>
  </ASurface>
</template>
