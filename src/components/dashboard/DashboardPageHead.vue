<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlugsConnected, PhWifiHigh, PhWifiSlash, PhWifiX } from '@phosphor-icons/vue'

import AProgress from '@/components/ui/AProgress.vue'
import type { OperationHealthLevel } from '@/types/operations'
import type { RealtimeConnectionState } from '@/types/realtime'
import DashboardTabs, { type DashboardTab } from './DashboardTabs.vue'

const props = defineProps<{
  tab: DashboardTab
  health: { score: number; level: OperationHealthLevel } | null
  attentionCount: number
  /** A background refresh after a table/session action — never blanks existing content, just a quiet hint. */
  refreshing?: boolean
  /**
   * Passo 1.3: the real Reverb connection state — this badge used to be a
   * hardcoded "REST only" label (true at the time: realtime didn't exist
   * yet). Never fake a green/live pulse here again once it's wired up.
   */
  connectionState?: RealtimeConnectionState
}>()

defineEmits<{ 'update:tab': [DashboardTab] }>()

const { t } = useI18n()

const CONNECTION_ICON: Record<RealtimeConnectionState, typeof PhWifiHigh> = {
  connected: PhWifiHigh,
  connecting: PhPlugsConnected,
  reconnecting: PhPlugsConnected,
  disconnected: PhWifiSlash,
  unavailable: PhWifiSlash,
  error: PhWifiX,
}

const connectionIcon = computed(() => CONNECTION_ICON[props.connectionState ?? 'unavailable'])
const connectionLabel = computed(() => t(`operations.connection.${props.connectionState ?? 'unavailable'}`))

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
        <!-- Real Reverb connection state (Passo 1.3) — a background HTTP
             refresh still takes visual priority when one is in flight, same
             as before; never a fixed "live" pulse regardless of the actual socket. -->
        <span class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-label-md text-on-surface-variant">
          <AProgress v-if="refreshing" size="sm" />
          <component :is="connectionIcon" v-else :size="12" aria-hidden="true" />
          {{ refreshing ? t('operations.connection.refreshing') : connectionLabel }}
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
