<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhClockCounterClockwise } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import type { ApiError } from '@/api/errors'
import type { RestaurantActivityEvent } from '@/types/activity'
import { ACTIVITY_TYPE_PRESENTATION } from '@/utils/activity-presentation'
import { formatOperationInstant } from '@/utils/operation-timing'

const props = defineProps<{
  events: RestaurantActivityEvent[]
  loading: boolean
  error: ApiError | null
  timezone: string
}>()

defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()

function dayKey(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: props.timezone }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** Today's events read as a clock time; anything older also names its day, so an old event never passes for a recent one. */
function when(event: RestaurantActivityEvent): string {
  const date = new Date(event.occurred_at)
  if (Number.isNaN(date.getTime())) return t('operations.board.timing.invalid')
  if (dayKey(date) !== dayKey(new Date())) return formatOperationInstant(date, locale.value, props.timezone)
  try {
    return new Intl.DateTimeFormat(locale.value, { timeStyle: 'short', timeZone: props.timezone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-ES', { timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(date)
  }
}

function context(event: RestaurantActivityEvent): string {
  const parts: string[] = []
  if (event.table) parts.push(t('activity.context.table', { name: event.table.name }))
  if (event.order) parts.push(t('activity.context.order', { reference: event.order.reference }))
  if (event.actor.type === 'staff' && event.actor.name) parts.push(event.actor.name)
  return parts.join(' · ')
}
</script>

<template>
  <div v-if="loading && events.length === 0" class="flex flex-col gap-2" aria-busy="true">
    <div v-for="index in 3" :key="index" class="h-10 rounded-saloa-sm bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
  </div>

  <div v-else-if="error && events.length === 0" class="flex flex-col items-start gap-2" role="alert">
    <p class="text-body-sm text-fg-muted">{{ t('operations.board.activity.error') }}</p>
    <AButton variant="ghost" size="sm" @click="$emit('retry')">{{ t('operations.board.activity.retry') }}</AButton>
  </div>

  <p v-else-if="events.length === 0" class="text-body-sm text-fg-muted">{{ t('operations.board.activity.empty') }}</p>

  <ol v-else class="flex flex-col">
    <li v-for="event in events" :key="event.id" class="flex min-w-0 items-start gap-3 border-b border-hairline py-2.5 first:pt-0 last:border-b-0">
      <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-fg-muted" aria-hidden="true">
        <component :is="ACTIVITY_TYPE_PRESENTATION[event.type]?.icon ?? PhClockCounterClockwise" :size="14" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="break-words text-body-sm font-medium text-fg">
          {{ ACTIVITY_TYPE_PRESENTATION[event.type] ? t(ACTIVITY_TYPE_PRESENTATION[event.type].labelKey) : t('operations.now.genericAttention') }}
        </p>
        <p v-if="context(event)" class="break-words text-label-md text-fg-muted">{{ context(event) }}</p>
      </div>
      <time class="shrink-0 text-label-md tabular-nums text-fg-muted" :datetime="event.occurred_at">{{ when(event) }}</time>
    </li>
  </ol>
</template>
