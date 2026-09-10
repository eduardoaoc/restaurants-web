<script setup lang="ts">
export type DashboardTab = 'operation' | 'analysis'

defineProps<{ modelValue: DashboardTab; operationLabel: string; analysisLabel: string }>()
defineEmits<{ 'update:modelValue': [DashboardTab] }>()
</script>

<template>
  <!-- Segmented control, matches the HTML reference's `.tabs` treatment -->
  <div class="inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="tablist">
    <button
      type="button"
      role="tab"
      :aria-selected="modelValue === 'operation'"
      class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="modelValue === 'operation' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
      @click="$emit('update:modelValue', 'operation')"
    >
      {{ operationLabel }}
    </button>
    <button
      type="button"
      role="tab"
      :aria-selected="modelValue === 'analysis'"
      class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="modelValue === 'analysis' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
      @click="$emit('update:modelValue', 'analysis')"
    >
      {{ analysisLabel }}
    </button>
  </div>
</template>
