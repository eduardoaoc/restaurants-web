<script setup lang="ts">
defineProps<{ loading?: boolean; reserveLeading?: boolean; iconOnly?: boolean }>()
</script>

<template>
  <span v-if="reserveLeading || $slots.leading || iconOnly" class="a-control-icon" aria-hidden="true">
    <svg v-if="loading" class="a-control-spinner" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity=".25" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <slot v-else-if="iconOnly" />
    <slot v-else name="leading" />
  </span>
  <span v-if="!iconOnly" class="a-control-label"><slot /></span>
  <span v-if="!iconOnly && $slots.trailing" class="a-control-icon" aria-hidden="true"><slot name="trailing" /></span>
</template>
