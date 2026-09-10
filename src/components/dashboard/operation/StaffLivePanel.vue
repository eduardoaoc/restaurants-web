<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhUsersThree } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import type { OperationsStaffMember } from '@/types/operations'
import { formatDuration, formatNumber } from '@/utils/format'

defineProps<{ staff: OperationsStaffMember[] }>()

const { t, locale } = useI18n()

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
</script>

<template>
  <EmptyState v-if="staff.length === 0" :icon="PhUsersThree" :message="t('operations.staff.empty')" />

  <ul v-else class="flex flex-col divide-y divide-outline-variant">
    <li v-for="member in staff" :key="member.user.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-lg font-semibold text-on-secondary-container"
        aria-hidden="true"
      >
        {{ initials(member.user.name) }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-body-md font-medium text-on-surface">{{ member.user.name ?? t('operations.staff.unnamed') }}</p>
        <!-- Real numbers only — no "Normal/Overloaded" label: the backend defines no threshold for that, see CLAUDE.md §46 -->
        <p class="text-label-md text-on-surface-variant">
          {{ t('operations.staff.summary', {
            tables: formatNumber(member.load.assigned_tables, locale),
            guests: formatNumber(member.load.assigned_guests, locale),
            pending: formatNumber(member.load.pending_attention, locale),
          }) }}
        </p>
      </div>
      <span class="shrink-0 text-label-md text-on-surface-variant">{{ formatDuration(member.active_seconds) }}</span>
    </li>
  </ul>
</template>
