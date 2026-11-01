<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhCalendarCheck, PhCalendarX, PhPlugsConnected, PhWifiHigh, PhWifiSlash, PhWifiX } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import APageHeader from '@/components/ui/APageHeader.vue'
import type { RealtimeConnectionState } from '@/types/realtime'
import DashboardTabs, { type DashboardTab } from './DashboardTabs.vue'

const props = defineProps<{
  tab: DashboardTab
  refreshing?: boolean
  canRefresh?: boolean
  connectionState?: RealtimeConnectionState
  /** Operational-day state for the Operation page; omitted on Analytics or before the snapshot loads. */
  dayState?: { open: boolean; label: string } | null
}>()

const emit = defineEmits<{ refresh: [] }>()
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
const connectionLabel = computed(() => t(`operations.connection.${props.refreshing ? 'refreshing' : props.connectionState ?? 'unavailable'}`))
const connectionTone = computed(() => {
  if (props.connectionState === 'connected' && !props.refreshing) return 'text-success'
  if (props.connectionState === 'error' || props.connectionState === 'unavailable' || props.connectionState === 'disconnected') return 'text-warning'
  return 'text-fg-muted'
})
const title = computed(() => t(props.tab === 'operation' ? 'operations.board.title' : 'operations.board.analyticsTitle'))
</script>

<template>
  <APageHeader :title="title" class="dashboard-page-head">
    <template #description>
      <span class="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
        <span v-if="dayState" class="inline-flex items-center gap-1.5 font-medium" :class="dayState.open ? 'text-fg' : 'text-warning'">
          <component :is="dayState.open ? PhCalendarCheck : PhCalendarX" :size="16" aria-hidden="true" />
          {{ dayState.label }}
        </span>
        <span class="inline-flex items-center gap-1.5 text-fg-muted" role="status">
          <component :is="connectionIcon" :size="16" :class="connectionTone" aria-hidden="true" />
          {{ connectionLabel }}
        </span>
      </span>
    </template>
    <template #actions>
      <AButton v-if="canRefresh && tab === 'operation'" variant="ghost" size="sm" :loading="refreshing" @click="emit('refresh')">
        <template #leading><PhArrowsClockwise /></template>
        {{ t('operations.quickActions.refresh') }}
      </AButton>
      <DashboardTabs
        :model-value="tab"
        :operation-label="t('operations.tabs.operation')"
        :analysis-label="t('operations.tabs.analysis')"
      />
      <slot name="cta" />
    </template>
  </APageHeader>
</template>

<style scoped>
/* Compact header (reference composition): the board starts right under it. */
.a-page-header.dashboard-page-head { margin-bottom: calc(var(--spacing) * 4); }
</style>
