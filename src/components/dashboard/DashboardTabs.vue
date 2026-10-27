<script setup lang="ts">
import { useI18n } from 'vue-i18n'

export type DashboardTab = 'operation' | 'analysis'

defineProps<{ modelValue: DashboardTab; operationLabel: string; analysisLabel: string }>()
defineEmits<{ 'update:modelValue': [DashboardTab] }>()
const { t } = useI18n()
</script>

<template>
  <div class="inline-flex max-w-full flex-wrap gap-1 rounded-saloa-md bg-surface-subtle p-1" role="group" :aria-label="t('operations.tabs.label')">
    <button
      type="button"
      :aria-pressed="modelValue === 'operation'"
      class="inline-flex min-h-11 max-w-full items-center justify-center rounded-saloa-sm px-4 text-label-lg transition-colors duration-fast ease-out pointer-fine:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      :class="modelValue === 'operation' ? 'bg-surface font-semibold text-fg shadow-raised' : 'font-medium text-fg-muted hover:text-fg'"
      @click="$emit('update:modelValue', 'operation')"
    >
      {{ operationLabel }}
    </button>
    <button
      type="button"
      :aria-pressed="modelValue === 'analysis'"
      class="inline-flex min-h-11 max-w-full items-center justify-center rounded-saloa-sm px-4 text-label-lg transition-colors duration-fast ease-out pointer-fine:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      :class="modelValue === 'analysis' ? 'bg-surface font-semibold text-fg shadow-raised' : 'font-medium text-fg-muted hover:text-fg'"
      @click="$emit('update:modelValue', 'analysis')"
    >
      {{ analysisLabel }}
    </button>
  </div>
</template>
