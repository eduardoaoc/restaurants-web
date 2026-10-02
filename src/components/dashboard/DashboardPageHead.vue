<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhInfo, PhPlugsConnected, PhWifiHigh, PhWifiSlash, PhWifiX } from '@phosphor-icons/vue'

import AProgress from '@/components/ui/AProgress.vue'
import type { OperationHealthLevel, OperationsHealth } from '@/types/operations'
import type { RealtimeConnectionState } from '@/types/realtime'
import { formatDuration } from '@/utils/format'
import { operationsAlertTypeLabelKey } from '@/utils/operations-alerts'
import DashboardTabs, { type DashboardTab } from './DashboardTabs.vue'

const props = defineProps<{
  tab: DashboardTab
  health: OperationsHealth | null
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
  const tone = HEALTH_RING_TONE[props.health.health_level]
  return { background: `conic-gradient(${tone} ${props.health.health_score}%, var(--color-surface-container-high) 0)` }
})

/**
 * §6/§16 of Carta 6.2 — the backend's `operation.bottleneck` field (the
 * single most urgent alert driving the score down, chosen deterministically
 * by OperationsBottleneckResolver) existed in the contract but was never
 * rendered anywhere before this carta. Reuses the exact same alert-type
 * vocabulary/labels AttentionPanel already shows — never a second copy.
 */
const bottleneckInfo = computed(() => {
  const bottleneck = props.health?.bottleneck
  if (!bottleneck) return null
  const key = operationsAlertTypeLabelKey(bottleneck.type)
  return {
    typeLabel: key ? t(key) : bottleneck.type,
    countLabel: t('operations.health.bottleneckCount', bottleneck.affected_count),
    ageLabel: t('operations.alerts.age', { age: formatDuration(bottleneck.oldest_age_seconds) }),
  }
})

// §6 — a plain-language, collapsed-by-default disclosure of how the score is
// computed, worded truthfully against the real backend algorithm (alerts by
// severity lower the score) without exposing exact point weights as an API
// guarantee that could silently drift from the real implementation.
const legendOpen = ref(false)
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
          <span class="relative text-label-lg font-bold text-on-surface">{{ health.health_score }}</span>
        </div>
        <div>
          <p class="flex items-center gap-1.5 text-label-lg font-medium text-on-surface">
            {{ t('operations.health.title') }}
            <span :style="{ color: HEALTH_RING_TONE[health.health_level] }">{{ t(`operations.health.level.${health.health_level}`) }}</span>
            <button
              type="button"
              class="inline-flex h-5 w-5 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :aria-expanded="legendOpen"
              aria-controls="operations-health-legend"
              :aria-label="t('operations.health.howCalculated')"
              @click="legendOpen = !legendOpen"
            >
              <PhInfo :size="14" aria-hidden="true" />
            </button>
          </p>
          <p class="text-label-md text-on-surface-variant">
            {{ attentionCount > 0 ? t('operations.health.attentionCount', attentionCount) : t('operations.health.noAttention') }}
          </p>
          <p v-if="bottleneckInfo" class="mt-0.5 text-label-md text-on-surface-variant">
            {{ t('operations.health.bottleneckPrefix') }}: {{ bottleneckInfo.typeLabel }} · {{ bottleneckInfo.countLabel }} · {{ bottleneckInfo.ageLabel }}
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

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="legendOpen"
        id="operations-health-legend"
        class="w-full rounded-lg border border-outline-variant bg-surface-container p-4 lg:order-last lg:w-auto lg:max-w-md"
      >
        <p class="text-label-lg font-semibold text-on-surface">{{ t('operations.health.legendTitle') }}</p>
        <ul class="mt-2 flex flex-col gap-2">
          <li v-for="level in (['healthy', 'attention', 'critical'] as const)" :key="level" class="flex gap-2 text-label-md">
            <span class="shrink-0 font-medium" :style="{ color: HEALTH_RING_TONE[level] }">{{ t(`operations.health.level.${level}`) }}</span>
            <span class="text-on-surface-variant">{{ t(`operations.health.legend.${level}`) }}</span>
          </li>
        </ul>
      </div>
    </Transition>
  </section>
</template>
