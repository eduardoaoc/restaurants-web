<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhChartBar } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import { useInViewOnce } from '@/composables/useInViewOnce'
import type { AnalyticsPeakHour } from '@/types/analytics'
import { formatNumber } from '@/utils/format'

const props = defineProps<{ hours: AnalyticsPeakHour[] }>()

const { t, locale } = useI18n()

const hasData = computed(() => props.hours.some((h) => h.sessions_started > 0))
const maxValue = computed(() => Math.max(...props.hours.map((h) => h.sessions_started), 1))

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
  const duration = 700
  const start = performance.now()
  const step = (now: number): void => {
    progress.value = Math.min((now - start) / duration, 1)
    if (progress.value < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

watch(inView, (isInView) => {
  if (isInView) startAnimation()
})

const hoverHour = ref<number | null>(null)
</script>

<template>
  <div ref="rootEl">
    <EmptyState v-if="!hasData" :icon="PhChartBar" :message="t('analytics.charts.peakHoursEmpty')" />
    <template v-else>
      <div class="flex h-40 items-end gap-1">
        <div
          v-for="bucket in hours"
          :key="bucket.hour"
          class="group relative flex-1"
          @mouseenter="hoverHour = bucket.hour"
          @mouseleave="hoverHour = null"
        >
          <div
            class="w-full rounded-t-sm bg-[var(--chart-accent)] transition-[height] duration-150 ease-out"
            :style="{ height: `${(bucket.sessions_started / maxValue) * 100 * progress}%` }"
          />
          <div
            v-if="hoverHour === bucket.hour"
            class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-container-highest px-2 py-1 text-label-md text-on-surface shadow-elevated"
          >
            {{ t('analytics.charts.peakHoursTooltip', { hour: bucket.hour, count: formatNumber(bucket.sessions_started, locale) }) }}
          </div>
        </div>
      </div>
      <div class="mt-1 flex text-label-md text-on-surface-variant">
        <span v-for="bucket in hours" :key="bucket.hour" class="flex-1 text-center">
          {{ bucket.hour % 3 === 0 ? `${bucket.hour}h` : '' }}
        </span>
      </div>
    </template>
  </div>
</template>
