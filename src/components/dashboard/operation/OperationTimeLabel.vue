<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhClockCounterClockwise } from '@phosphor-icons/vue'

import { formatDuration } from '@/utils/format'
import { formatOperationInstant, type OperationTiming } from '@/utils/operation-timing'

/**
 * One rendering for every classified age on the Operation board: a real
 * wait in the current service reads as a duration; a leftover from a
 * previous session reads as its start instant (icon + text, never colour
 * alone); a missing/negative value says so instead of printing "0s".
 */
const props = withDefaults(defineProps<{ timing: OperationTiming; timezone: string; prefix?: 'ago' | 'none' }>(), { prefix: 'none' })
const { t, locale } = useI18n()

const text = computed(() => {
  const timing = props.timing
  if (timing.kind === 'invalid') return t('operations.board.timing.invalid')
  if (timing.kind === 'previous') return t('operations.board.timing.since', { date: formatOperationInstant(timing.since, locale.value, props.timezone) })
  const duration = formatDuration(timing.seconds)
  return props.prefix === 'ago' ? t('operations.alerts.age', { age: duration }) : duration
})
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1 tabular-nums" :class="timing.kind === 'current' ? '' : 'text-fg-muted'">
    <PhClockCounterClockwise v-if="timing.kind === 'previous'" :size="14" class="shrink-0" aria-hidden="true" />
    <span class="min-w-0 break-words">{{ text }}</span>
  </span>
</template>
