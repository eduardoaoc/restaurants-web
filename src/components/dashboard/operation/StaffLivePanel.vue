<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhClockCounterClockwise } from '@phosphor-icons/vue'

import type { OperationsDailyOperation } from '@/types/daily-operation'
import type { OperationsStaffMember } from '@/types/operations'
import { formatDuration, formatNumber } from '@/utils/format'
import { classifyOperationAge, formatOperationInstant } from '@/utils/operation-timing'

const props = withDefaults(defineProps<{
  staff: OperationsStaffMember[]
  generatedAt: string
  dailyOperation: OperationsDailyOperation
  timezone: string
  limit?: number
}>(), { limit: 5 })

const { t, locale } = useI18n()

// Server order, no ranking or productivity score. A shift started before
// the current operational day is shown with its start instead of a
// "1003h" time on shift (see utils/operation-timing.ts).
const rows = computed(() =>
  props.staff.slice(0, props.limit).map((member) => ({
    member,
    timing: classifyOperationAge(member.active_seconds, props.generatedAt, props.dailyOperation),
  })),
)
const hiddenCount = computed(() => Math.max(0, props.staff.length - props.limit))

function initials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase()).join('')
}
</script>

<template>
  <p v-if="staff.length === 0" class="text-body-sm text-fg-muted">{{ t('operations.staff.empty') }}</p>

  <div v-else class="flex flex-col">
    <ul class="divide-y divide-hairline">
      <li v-for="{ member, timing } in rows" :key="member.user.id" class="flex min-w-0 items-center gap-3 py-2.5 first:pt-0">
        <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-label-md font-semibold text-fg-muted" aria-hidden="true">
          {{ initials(member.user.name) }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="break-words text-body-sm font-medium text-fg">{{ member.user.name ?? t('operations.staff.unnamed') }}</p>
          <p class="break-words text-label-md tabular-nums text-fg-muted">
            {{ t('operations.board.staff.load', { tables: formatNumber(member.load.assigned_tables, locale), guests: formatNumber(member.load.assigned_guests, locale) }) }}
          </p>
          <p v-if="timing.kind === 'previous'" class="inline-flex items-center gap-1 text-label-md text-fg-muted">
            <PhClockCounterClockwise :size="12" class="shrink-0" aria-hidden="true" />
            {{ t('operations.board.staff.previousShift', { date: formatOperationInstant(timing.since, locale, timezone) }) }}
          </p>
        </div>
        <span v-if="member.load.pending_attention > 0" class="inline-flex shrink-0 items-center gap-1 rounded-saloa-sm bg-primary-subtle px-2 py-0.5 text-label-md font-semibold tabular-nums text-accent">
          <PhBellRinging :size="12" weight="fill" aria-hidden="true" />
          {{ t('operations.board.staff.pending', member.load.pending_attention) }}
        </span>
        <span v-else-if="timing.kind === 'current'" class="shrink-0 text-label-md tabular-nums text-fg-muted" :title="t('staff.shift.onShift')">
          {{ formatDuration(timing.seconds) }}
        </span>
      </li>
    </ul>
    <slot name="more" :hidden-count="hiddenCount" />
  </div>
</template>
