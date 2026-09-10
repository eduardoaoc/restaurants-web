<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWifiSlash } from '@phosphor-icons/vue'

import type { OperationHealthLevel } from '@/types/operations'
import DashboardTabs, { type DashboardTab } from './DashboardTabs.vue'

const props = defineProps<{
  tab: DashboardTab
  health: { score: number; level: OperationHealthLevel } | null
  attentionCount: number
}>()

defineEmits<{ 'update:tab': [DashboardTab] }>()

const { t } = useI18n()

const HEALTH_RING_TONE: Record<OperationHealthLevel, string> = {
  healthy: 'var(--color-success)',
  attention: 'var(--color-warning)',
  critical: 'var(--color-critical)',
}

const ringStyle = computed(() => {
  if (!props.health) return {}
  const tone = HEALTH_RING_TONE[props.health.level]
  return { background: `conic-gradient(${tone} ${props.health.score}%, var(--color-surface-container-high) 0)` }
})
</script>

<template>
  <section class="flex flex-col gap-4 pb-2 pt-1 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="text-headline font-bold text-on-surface">{{ t('operations.pageTitle') }}</h2>
        <!-- Real, truthful connection state — never a fixed "live" pulse before Realtime actually ships -->
        <span class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-label-md text-on-surface-variant">
          <PhWifiSlash :size="12" aria-hidden="true" />
          {{ t('operations.connection.restOnly') }}
        </span>
      </div>
      <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('operations.pageSubtitle') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <div v-if="health" class="flex items-center gap-3">
        <div class="relative grid h-14 w-14 place-items-center rounded-full" :style="ringStyle">
          <div class="absolute inset-[5px] rounded-full bg-surface-container" />
          <span class="relative text-label-lg font-bold text-on-surface">{{ health.score }}</span>
        </div>
        <div>
          <p class="text-label-lg font-medium text-on-surface">
            {{ t('operations.health.title') }}
            <span :style="{ color: HEALTH_RING_TONE[health.level] }">{{ t(`operations.health.level.${health.level}`) }}</span>
          </p>
          <p class="text-label-md text-on-surface-variant">
            {{ attentionCount > 0 ? t('operations.health.attentionCount', attentionCount) : t('operations.health.noAttention') }}
          </p>
        </div>
      </div>

      <DashboardTabs
        :model-value="tab"
        :operation-label="t('operations.tabs.operation')"
        :analysis-label="t('operations.tabs.analysis')"
        @update:model-value="$emit('update:tab', $event)"
      />
    </div>
  </section>
</template>
