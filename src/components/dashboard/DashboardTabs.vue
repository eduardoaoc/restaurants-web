<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'

export type DashboardTab = 'operation' | 'analysis'

/** Operation and Analytics are separate pages (own routes); this is their shared, neutral switcher. */
defineProps<{ modelValue: DashboardTab; operationLabel: string; analysisLabel: string }>()
const { t } = useI18n()

const TABS = [
  { id: 'operation', route: 'app-dashboard', labelProp: 'operationLabel' },
  { id: 'analysis', route: 'app-dashboard-analytics', labelProp: 'analysisLabel' },
] as const
</script>

<template>
  <nav class="inline-flex max-w-full flex-wrap gap-1 rounded-saloa-md bg-surface-subtle p-1" :aria-label="t('operations.tabs.label')">
    <RouterLink
      v-for="tab in TABS"
      :key="tab.id"
      :to="{ name: tab.route }"
      :aria-current="modelValue === tab.id ? 'page' : undefined"
      class="inline-flex min-h-11 max-w-full items-center justify-center rounded-saloa-sm px-4 text-label-lg transition-colors duration-fast ease-out pointer-fine:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      :class="modelValue === tab.id ? 'bg-surface font-semibold text-fg shadow-raised' : 'font-medium text-fg-muted hover:text-fg'"
    >
      {{ tab.labelProp === 'operationLabel' ? operationLabel : analysisLabel }}
    </RouterLink>
  </nav>
</template>
