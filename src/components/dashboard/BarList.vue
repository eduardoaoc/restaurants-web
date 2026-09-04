<script setup lang="ts">
import { computed } from 'vue'
import { PhChartBarHorizontal } from '@phosphor-icons/vue'

import EmptyState from './EmptyState.vue'

interface Item {
  key: string
  label: string
  value: number
  displayValue: string
}

const props = withDefaults(
  defineProps<{
    items: Item[]
    emptyMessage: string
    color?: string
  }>(),
  { color: 'var(--chart-accent)' },
)

/**
 * Magnitude comparison across items (not distinct series) — single hue,
 * bar length encodes value, per the dataviz skill's "compare magnitude"
 * job (color-formula.md: sequential/one-hue, not categorical). See
 * docs/design-system.md §21.
 */
const maxValue = computed(() => Math.max(...props.items.map((item) => item.value), 0))
const hasData = computed(() => props.items.some((item) => item.value > 0))
</script>

<template>
  <EmptyState v-if="!hasData" :icon="PhChartBarHorizontal" :message="emptyMessage" />

  <ol v-else class="flex flex-col gap-3">
    <li v-for="item in items" :key="item.key" class="flex flex-col gap-1">
      <div class="flex items-center justify-between gap-3 text-body-md">
        <span class="min-w-0 flex-1 truncate text-on-surface-variant">{{ item.label }}</span>
        <span class="shrink-0 font-medium text-on-surface">{{ item.displayValue }}</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div
          class="h-full rounded-full transition-[width] duration-300 ease-out"
          :style="{
            width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : '0%',
            backgroundColor: color,
          }"
        />
      </div>
    </li>
  </ol>
</template>
