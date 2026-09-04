<script setup lang="ts">
import { computed } from 'vue'
import { PhChartDonut } from '@phosphor-icons/vue'

import EmptyState from './EmptyState.vue'

interface Segment {
  key: string
  label: string
  value: number
  displayValue: string
  color: string
}

const props = withDefaults(
  defineProps<{
    segments: Segment[]
    centerValue?: string
    centerLabel?: string
    size?: number
    emptyMessage: string
  }>(),
  { size: 160 },
)

const strokeWidth = 20
const radius = computed(() => props.size / 2 - strokeWidth / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const total = computed(() => props.segments.reduce((sum, s) => sum + s.value, 0))
const gapPx = 3

/**
 * Real distributions only (never a fabricated split) — see
 * docs/design-system.md §21. Each segment's dash length is shortened by a
 * fixed gap so touching slices separate via a surface-color gap, not a
 * stroke drawn around them (marks-and-anatomy: "surface gap" spacer).
 */
const arcs = computed(() => {
  if (total.value <= 0) return []

  let offset = 0
  return props.segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const fraction = segment.value / total.value
      const length = Math.max(fraction * circumference.value - gapPx, 0)
      const arc = { ...segment, length, offset }
      offset += fraction * circumference.value
      return arc
    })
})
</script>

<template>
  <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
    <EmptyState v-if="total <= 0" :icon="PhChartDonut" :message="emptyMessage" class="flex-1" />

    <template v-else>
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" role="img" :aria-label="centerLabel">
        <circle
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="none"
          stroke="var(--md-sys-color-surface-container-high)"
          :stroke-width="strokeWidth"
        />
        <circle
          v-for="arc in arcs"
          :key="arc.key"
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="none"
          :stroke="arc.color"
          :stroke-width="strokeWidth"
          :stroke-dasharray="`${arc.length} ${circumference}`"
          :stroke-dashoffset="-arc.offset"
          transform-origin="center"
          transform="rotate(-90)"
        />
        <text
          v-if="centerValue"
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="central"
          class="fill-on-surface text-title-lg font-semibold"
        >
          {{ centerValue }}
        </text>
      </svg>

      <dl class="flex min-w-0 flex-1 flex-col gap-2">
        <div v-for="segment in segments.filter((s) => s.value > 0)" :key="segment.key" class="flex items-center gap-2 text-body-md">
          <span aria-hidden="true" class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: segment.color }" />
          <dt class="min-w-0 flex-1 truncate text-on-surface-variant">{{ segment.label }}</dt>
          <dd class="shrink-0 font-medium text-on-surface">{{ segment.displayValue }}</dd>
        </div>
      </dl>
    </template>
  </div>
</template>
