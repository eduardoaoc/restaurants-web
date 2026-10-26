<script setup lang="ts">
import AOverlay from './AOverlay.vue'
import type { OverlayProps } from './overlay'
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<OverlayProps & { variant?: 'bottom' | 'side'; modal?: boolean; size?: 'sm' | 'md' }>(), {
  open: true, variant: 'bottom', modal: true, size: 'sm', dismissible: true, closeOnScrim: true, closeOnEscape: true,
})
defineEmits<{ close: []; 'update:open': [boolean]; 'close-error': [unknown] }>()
</script>

<template>
  <AOverlay
    v-bind="$attrs" :title="title" :open="open" :dismissible="dismissible"
    :close-on-scrim="closeOnScrim" :close-on-escape="closeOnEscape"
    :initial-focus="initialFocus" :before-close="beforeClose" :size="size"
    :kind="variant" :modal="variant === 'bottom' || modal"
    @close="$emit('close')" @update:open="$emit('update:open', $event)" @close-error="$emit('close-error', $event)"
  >
    <template v-if="$slots.header" #header><slot name="header" /></template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </AOverlay>
</template>
