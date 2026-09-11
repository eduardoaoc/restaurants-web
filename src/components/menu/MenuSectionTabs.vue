<script setup lang="ts">
export type MenuSection = 'categories' | 'products' | 'modifiers'

defineProps<{
  modelValue: MenuSection
  sections: { id: MenuSection; label: string }[]
}>()
defineEmits<{ 'update:modelValue': [MenuSection] }>()
</script>

<template>
  <!-- Same segmented-control treatment as DashboardTabs.vue — kept as its own
       small component rather than generalizing DashboardTabs, since that one
       is tightly typed to the Dashboard's own 2 fixed tabs. -->
  <div class="inline-flex flex-wrap gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="tablist">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === section.id"
      class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="modelValue === section.id ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
      @click="$emit('update:modelValue', section.id)"
    >
      {{ section.label }}
    </button>
  </div>
</template>
