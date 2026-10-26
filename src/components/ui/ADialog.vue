<script setup lang="ts">
import AOverlay from './AOverlay.vue'
import type { OverlayProps } from './overlay'
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<OverlayProps & { size?: 'sm' | 'md' }>(), { open: true, size: 'md', dismissible: true, closeOnScrim: true, closeOnEscape: true })
defineEmits<{ close: []; 'update:open': [boolean]; 'close-error': [unknown] }>()
</script>

<template>
  <AOverlay v-bind="{ ...$attrs, ...$props }" kind="dialog" @close="$emit('close')" @update:open="$emit('update:open', $event)" @close-error="$emit('close-error', $event)">
    <template v-if="$slots.header" #header><slot name="header" /></template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </AOverlay>
</template>
