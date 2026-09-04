<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  message: string
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-6 text-center text-on-surface-variant">
    <component :is="icon" :size="24" class="opacity-60" />
    <p class="text-body-md">{{ message }}</p>
  </div>
</template>
