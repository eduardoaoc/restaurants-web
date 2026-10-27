<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhPlugsConnected, PhWifiHigh, PhWifiSlash, PhWifiX } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import APageHeader from '@/components/ui/APageHeader.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import type { RealtimeConnectionState } from '@/types/realtime'
import DashboardTabs, { type DashboardTab } from './DashboardTabs.vue'

const props = defineProps<{
  tab: DashboardTab
  refreshing?: boolean
  canRefresh?: boolean
  connectionState?: RealtimeConnectionState
}>()

const emit = defineEmits<{ 'update:tab': [DashboardTab]; refresh: [] }>()
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
const connectionState = computed(() => {
  if (props.connectionState === 'connected' && !props.refreshing) return 'success'
  if (props.connectionState === 'error' || props.connectionState === 'unavailable') return 'warning'
  return 'normal'
})
</script>

<template>
  <APageHeader :title="t('operations.pageTitle')">
    <template #description>
      <AStatusBadge :state="connectionState" :label="connectionLabel" :icon="connectionIcon" />
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
        @update:model-value="emit('update:tab', $event)"
      />
    </template>
  </APageHeader>
</template>
