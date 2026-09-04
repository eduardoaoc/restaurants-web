<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 0–1 */
    value: number
    size?: number
    label: string
    centerText: string
  }>(),
  { size: 56 },
)

const strokeWidth = 6
const radius = (props.size - strokeWidth) / 2
const circumference = 2 * Math.PI * radius
const clamped = computed(() => Math.min(Math.max(props.value, 0), 1))
const dashOffset = computed(() => circumference * (1 - clamped.value))
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" role="img" :aria-label="label">
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      stroke="var(--md-sys-color-surface-container-high)"
      :stroke-width="strokeWidth"
    />
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      stroke="var(--chart-accent)"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="dashOffset"
      transform-origin="center"
      transform="rotate(-90)"
    />
    <text
      x="50%"
      y="50%"
      text-anchor="middle"
      dominant-baseline="central"
      class="fill-on-surface text-label-md font-semibold"
    >
      {{ centerText }}
    </text>
  </svg>
</template>
