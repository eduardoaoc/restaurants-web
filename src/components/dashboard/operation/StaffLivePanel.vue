<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { OperationsStaffMember } from '@/types/operations'
import { formatDuration, formatNumber } from '@/utils/format'

defineProps<{ staff: OperationsStaffMember[] }>()

const { t, locale } = useI18n()

function initials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase()).join('')
}
</script>

<template>
  <p v-if="staff.length === 0" class="rounded-saloa-lg border border-hairline bg-surface px-4 py-3 text-body-sm text-fg-muted">{{ t('operations.staff.empty') }}</p>

  <ul v-else class="divide-y divide-hairline overflow-hidden rounded-saloa-lg border border-hairline bg-surface">
    <li v-for="member in staff.slice(0, 4)" :key="member.user.id" class="flex min-w-0 items-center gap-3 px-4 py-3">
      <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-label-md font-semibold text-fg-muted" aria-hidden="true">
        {{ initials(member.user.name) }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="break-words text-body-sm font-medium text-fg">{{ member.user.name ?? t('operations.staff.unnamed') }}</p>
        <p class="break-words text-label-md tabular-nums text-fg-muted">
          {{ t('operations.staff.summary', {
            tables: formatNumber(member.load.assigned_tables, locale),
            guests: formatNumber(member.load.assigned_guests, locale),
            pending: formatNumber(member.load.pending_attention, locale),
          }) }}
        </p>
      </div>
      <div class="shrink-0 text-right">
        <p class="text-label-md text-fg-muted">{{ t('staff.shift.onShift') }}</p>
        <p class="text-body-sm tabular-nums text-fg">{{ formatDuration(member.active_seconds) }}</p>
      </div>
    </li>
  </ul>
</template>
