<script setup lang="ts">
import AOverlay from './AOverlay.vue'

// Legacy API (label/dismissible/close) retained for its callers; presentation
// and behavior are AOverlay's: a centred modal dialog like ADialog. Focus
// starts on the title so a phone keyboard never opens on its own.
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ label: string; dismissible?: boolean }>(), { dismissible: true })
defineEmits<{ close: [] }>()
</script>

<template>
  <AOverlay v-bind="$attrs" kind="dialog" :title="label" :aria-label="label" :dismissible="dismissible" initial-focus="[data-overlay-title]" @close="$emit('close')">
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </AOverlay>
</template>
