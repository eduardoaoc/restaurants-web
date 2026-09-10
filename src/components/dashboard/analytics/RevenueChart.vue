<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhChartLineUp } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import { useInViewOnce } from '@/composables/useInViewOnce'
import type { AnalyticsRevenuePoint } from '@/types/analytics'
import { formatDateOnly, formatMoney } from '@/utils/format'

const props = defineProps<{ points: AnalyticsRevenuePoint[]; currency: string }>()

const { t, locale } = useI18n()

const width = 700
const height = 200
const values = computed(() => props.points.map((p) => Number(p.revenue)))
const hasData = computed(() => values.value.some((v) => v > 0))
const maxValue = computed(() => Math.max(...values.value, 1))

function xAt(index: number): number {
  const n = props.points.length
  return n <= 1 ? width / 2 : (index / (n - 1)) * width
}
function yAt(value: number): number {
  return height - (value / maxValue.value) * (height - 12) - 4
}

const rootEl = ref<HTMLElement | null>(null)
const inView = useInViewOnce(rootEl)
const progress = ref(0)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let started = false
function startAnimation(): void {
  if (started) return
  started = true
  if (prefersReducedMotion()) {
    progress.value = 1
    return
  }
  const duration = 900
  const start = performance.now()
  const step = (now: number): void => {
    progress.value = Math.min((now - start) / duration, 1)
    if (progress.value < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// Animate the curve growing from the baseline (0) up to the real values —
// never a wipe-reveal of an already-final curve, and never a fabricated
// intermediate dataset: `values` themselves never change during the animation.
const animatedPoints = computed(() =>
  props.points.map((point, index) => {
    const target = yAt(values.value[index])
    const y = height - (height - target) * progress.value
    return { x: xAt(index), y, value: values.value[index], label: point.period_start }
  }),
)

watch(inView, (isInView) => {
  if (isInView) startAnimation()
})

const linePath = computed(() =>
  animatedPoints.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
)
const areaPath = computed(() => {
  if (animatedPoints.value.length === 0) return ''
  const first = animatedPoints.value[0]
  const last = animatedPoints.value[animatedPoints.value.length - 1]
  return `${linePath.value} L ${last.x} ${height} L ${first.x} ${height} Z`
})

const hoverIndex = ref<number | null>(null)
function onMove(event: MouseEvent): void {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  const index = Math.round(ratio * (props.points.length - 1))
  hoverIndex.value = Math.min(Math.max(index, 0), props.points.length - 1)
}
const hoverPoint = computed(() => (hoverIndex.value !== null ? animatedPoints.value[hoverIndex.value] : null))

// A handful of x-axis labels, never one per bucket (would collide on a 90-day range)
const axisLabels = computed(() => {
  const n = props.points.length
  if (n === 0) return []
  const step = Math.max(Math.ceil(n / 6), 1)
  return props.points.filter((_, i) => i % step === 0).map((p) => formatDateOnly(p.period_start, locale.value))
})
</script>

<template>
  <div ref="rootEl">
    <EmptyState v-if="!hasData" :icon="PhChartLineUp" :message="t('analytics.charts.revenueEmpty')" />
    <template v-else>
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        preserveAspectRatio="none"
        class="h-44 w-full"
        role="img"
        :aria-label="t('analytics.charts.revenueTitle')"
        @mousemove="onMove"
        @mouseleave="hoverIndex = null"
      >
        <defs>
          <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--chart-accent)" stop-opacity="0.22" />
            <stop offset="1" stop-color="var(--chart-accent)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="areaPath" fill="url(#revenueArea)" />
        <path :d="linePath" fill="none" stroke="var(--chart-accent)" stroke-width="2" stroke-linecap="round" />
        <g v-if="hoverPoint">
          <line :x1="hoverPoint.x" :x2="hoverPoint.x" y1="0" :y2="height" stroke="var(--color-outline-variant)" stroke-width="1" />
          <circle :cx="hoverPoint.x" :cy="hoverPoint.y" r="4" fill="var(--chart-accent)" stroke="var(--color-surface)" stroke-width="2" />
        </g>
      </svg>
      <div class="mt-1 flex justify-between text-label-md text-on-surface-variant">
        <span v-for="label in axisLabels" :key="label">{{ label }}</span>
      </div>
      <p v-if="hoverPoint" class="mt-1 text-label-lg text-on-surface" role="status">
        {{ formatDateOnly(hoverPoint.label, locale) }} — {{ formatMoney(String(hoverPoint.value), locale, currency) }}
      </p>
    </template>
  </div>
</template>
