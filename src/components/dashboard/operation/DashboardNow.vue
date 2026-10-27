<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretRight } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import type { OperationsHealth, OperationsAlert } from '@/types/operations'
import { operationsAlertTypeLabelKey } from '@/utils/operations-alerts'

const props = defineProps<{
  health: OperationsHealth
  alerts: OperationsAlert[]
  canViewService: boolean
}>()

const { t } = useI18n()
const alertCount = computed(() => props.alerts.length)
const healthState = computed(() => props.health.health_level === 'healthy' ? 'success' : props.health.health_level === 'attention' ? 'warning' : 'critical')
const healthLabel = computed(() => t(`operations.health.level.${props.health.health_level}`))
const summary = computed(() => {
  const bottleneck = props.health.bottleneck
  if (!bottleneck) return null
  const labelKey = operationsAlertTypeLabelKey(bottleneck.type)
  return {
    label: labelKey ? t(labelKey) : t('operations.now.genericAttention'),
    count: bottleneck.affected_count,
  }
})
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    :aria-label="t('operations.now.title')"
    aria-live="polite"
  >
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-component-title font-semibold text-fg">{{ t('operations.now.title') }}</h2>
        <AStatusBadge :state="healthState" :label="healthLabel" />
        <p class="min-w-0 break-words text-body-sm font-medium text-fg">
          {{ alertCount === 0 ? t('operations.now.clear') : t('operations.now.count', { count: alertCount }, alertCount) }}
        </p>
      </div>
      <p class="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-body-sm text-fg-muted">
        <span v-if="summary" class="min-w-0 break-words">{{ t('operations.health.bottleneckPrefix') }}: {{ summary.label }} ({{ summary.count }})</span>
        <span class="tabular-nums">{{ t('operations.health.scoreContext', { score: health.health_score }) }}</span>
      </p>
    </div>
    <AButton
      v-if="canViewService"
      as="RouterLink"
      :to="{ name: 'app-service' }"
      variant="secondary"
      size="sm"
      class="shrink-0 self-start sm:self-auto"
    >
      {{ t('operations.now.viewService') }}
      <template #trailing><PhCaretRight /></template>
    </AButton>
  </section>
</template>
